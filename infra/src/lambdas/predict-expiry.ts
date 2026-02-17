import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler';
import { v4 as uuidv4 } from 'uuid';

import { ddbDoc } from '../shared/dynamo';
import { badRequest, json } from '../shared/http';
import { predictExpiry } from '../shared/bedrock';
import { sendSms } from '../shared/sms';
import { info, warn } from '../shared/logger';
import { incrementMetric } from '../shared/metrics';
import { fetchTemperatureC } from '../shared/weather';

const scheduler = new SchedulerClient({});

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME;
const REMINDER_ROLE_ARN = process.env.SCHEDULER_INVOKE_ROLE_ARN;
const REMINDER_LAMBDA_ARN = process.env.REMINDER_LAMBDA_ARN;
const SCHEDULE_GROUP_NAME = process.env.SCHEDULE_GROUP_NAME;
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

const DRY_RUN_SMS = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';
const LEAD_TIME_HOURS = Number(process.env.LEAD_TIME_HOURS ?? '2');

function toAtExpression(date: Date): string {
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `at(${iso})`;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!ANALYSES_TABLE_NAME) return json(500, { message: 'Missing ANALYSES_TABLE_NAME' });

  const requestId = event.requestContext?.requestId;
  info('predict.request', { requestId });

  const body = event.body ? JSON.parse(event.body) : null;
  if (!body?.foodLabel) return badRequest('foodLabel is required');

  const foodLabel = String(body.foodLabel);
  const phoneNumber = body.phoneNumber ? String(body.phoneNumber) : undefined;

  // Metrics: prediction attempts.
  try {
    await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalPredictions' });
  } catch (e) {
    warn('predict.metric_failed', { requestId, error: e instanceof Error ? e.message : e });
  }

  // Optional weather enrichment (only if caller didn't provide temp).
  let temperatureC: number | undefined =
    body.currentTemperatureC != null ? Number(body.currentTemperatureC) : undefined;

  if (temperatureC == null && WEATHER_API_KEY) {
    try {
      const weather = await fetchTemperatureC({
        apiKey: WEATHER_API_KEY,
        city: body.weatherCity ? String(body.weatherCity) : undefined,
        lat: body.weatherLat != null ? Number(body.weatherLat) : undefined,
        lon: body.weatherLon != null ? Number(body.weatherLon) : undefined,
      });
      if (weather) temperatureC = weather.temperatureC;
    } catch (e) {
      warn('predict.weather_failed', { requestId, error: e instanceof Error ? e.message : e });
    }
  }

  info('predict.inputs', {
    requestId,
    foodLabel,
    rekognitionConfidence: body.rekognitionConfidence,
    temperatureC,
    hasWeatherKey: Boolean(WEATHER_API_KEY),
  });

  const predictionResult = await predictExpiry({
    modelId: MODEL_ID,
    foodType: foodLabel,
    storageCondition: body.storageCondition,
    preparationTime: body.preparationTime,
    currentTemperatureC: temperatureC,
  });

  if (!predictionResult.ok) {
    warn('predict.bedrock_failed', {
      requestId,
      foodLabel,
      error: predictionResult.error.message,
      details: predictionResult.error.details,
    });

    return json(200, {
      status: 'FAILED',
      errorCode: 'MODEL_ERROR',
      message:
        'Unable to generate an expiry estimate right now. Please use conservative food safety guidance (when in doubt, throw it out).',
      requestId,
    });
  }

  const prediction = predictionResult.value;

  const analysisId = uuidv4();
  const expiryAt = new Date(prediction.expiryTimestamp);

  const leadMs = LEAD_TIME_HOURS * 60 * 60 * 1000;
  const reminderAt = new Date(expiryAt.getTime() - leadMs);
  const now = Date.now();
  if (reminderAt.getTime() < now + 60 * 1000) {
    reminderAt.setTime(now + 60 * 1000);
  }

  const ttl = Math.floor((expiryAt.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);

  await ddbDoc.send(
    new PutCommand({
      TableName: ANALYSES_TABLE_NAME,
      Item: {
        analysisId,
        createdAtIso: new Date().toISOString(),
        s3Key: body.s3Key ? String(body.s3Key) : undefined,
        foodType: foodLabel,
        rekognitionConfidence: body.rekognitionConfidence != null ? Number(body.rekognitionConfidence) : undefined,
        storageCondition: body.storageCondition,
        preparationTime: body.preparationTime,
        currentTemperatureC: temperatureC,
        expiryAtIso: expiryAt.toISOString(),
        modelConfidence: prediction.modelConfidence,
        modelExplanation: prediction.explanation,
        phoneNumber,
        reminderAtIso: reminderAt.toISOString(),
        ttl,
      },
    })
  );

  if (REMINDER_ROLE_ARN && REMINDER_LAMBDA_ARN && SCHEDULE_GROUP_NAME) {
    try {
      await scheduler.send(
        new CreateScheduleCommand({
          Name: `analysis-${analysisId}`,
          GroupName: SCHEDULE_GROUP_NAME,
          FlexibleTimeWindow: { Mode: 'OFF' },
          ScheduleExpression: toAtExpression(reminderAt),
          Target: {
            Arn: REMINDER_LAMBDA_ARN,
            RoleArn: REMINDER_ROLE_ARN,
            Input: JSON.stringify({ analysisId, phoneNumber, expiryAtIso: expiryAt.toISOString() }),
          },
        })
      );

      try {
        await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalRemindersScheduled' });
      } catch (e) {
        warn('predict.metric_failed', { requestId, metric: 'totalRemindersScheduled', error: e instanceof Error ? e.message : e });
      }
    } catch (e) {
      warn('predict.scheduler_failed', { requestId, error: e instanceof Error ? e.message : e });
    }
  }

  if (phoneNumber) {
    await sendSms({
      phoneNumber,
      dryRun: DRY_RUN_SMS,
      message: `Anna Suraksha: ${foodLabel} expiry estimate ${expiryAt.toISOString()} (confidence ${prediction.modelConfidence.toFixed(0)}%).`,
    });
  }

  info('predict.result', {
    requestId,
    analysisId,
    foodLabel,
    expiryAtIso: expiryAt.toISOString(),
    reminderAtIso: reminderAt.toISOString(),
  });

  return json(200, {
    status: 'OK',
    analysisId,
    foodLabel,
    expiryAtIso: expiryAt.toISOString(),
    reminderAtIso: reminderAt.toISOString(),
    model: { modelConfidence: prediction.modelConfidence, explanation: prediction.explanation },
    dryRunSms: DRY_RUN_SMS,
    leadTimeHours: LEAD_TIME_HOURS,
  });
};
