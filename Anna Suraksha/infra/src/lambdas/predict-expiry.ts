import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
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
import { asOptionalFiniteNumber, asOptionalString, isNonEmptyString, safeJsonParseBody } from '../shared/validate';

const schedulerClient = new SchedulerClient({});

const ANALYSES_TABLE_NAME   = process.env.ANALYSES_TABLE_NAME;
const METRICS_TABLE_NAME    = process.env.METRICS_TABLE_NAME;
const REMINDER_ROLE_ARN     = process.env.SCHEDULER_INVOKE_ROLE_ARN;
const REMINDER_LAMBDA_ARN   = process.env.REMINDER_LAMBDA_ARN;
const SCHEDULE_GROUP_NAME   = process.env.SCHEDULE_GROUP_NAME;
const MODEL_ID              = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const WEATHER_API_KEY       = process.env.WEATHER_API_KEY;
const DRY_RUN_SMS           = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';
const LEAD_TIME_HOURS       = Number(process.env.LEAD_TIME_HOURS ?? '2');

function toAtExpression(date: Date): string {
  return `at(${date.toISOString().replace(/\.\d{3}Z$/, 'Z')})`;
}

// BUG FIX: Changed from APIGatewayProxyHandlerV2 → WithJWTAuthorizer
// so we can read userId from the JWT and store it on the analysis item.
// Without userId, the list-analyses GSI query (userId-createdAt-index) always returns empty.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!ANALYSES_TABLE_NAME) return json(500, { message: 'Missing ANALYSES_TABLE_NAME' });

  const requestId = event.requestContext?.requestId;
  // Extract userId from Cognito JWT — needed for the GSI
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  info('predict.request', { requestId, userId });

  const parsed = safeJsonParseBody(event.body);
  if (!parsed.ok) return badRequest(parsed.message);
  const body = parsed.value;
  if (!isNonEmptyString(body?.foodLabel)) return badRequest('foodLabel is required');

  const foodLabel = String(body.foodLabel).trim();
  if (foodLabel.length > 128) return badRequest('foodLabel is too long');

  const phoneNumber            = asOptionalString(body.phoneNumber);
  const rekognitionConfidence  = asOptionalFiniteNumber(body.rekognitionConfidence);
  const storageCondition       = asOptionalString(body.storageCondition);
  const preparationTime        = asOptionalString(body.preparationTime);
  // Vision score passed through from detect response (avoids double Bedrock call)
  const visionScore            = asOptionalFiniteNumber(body.visionScore);
  const visionTier             = asOptionalString(body.visionTier);
  const visionReason           = asOptionalString(body.visionReason);

  try {
    await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalPredictions' });
  } catch (e) {
    warn('predict.metric_failed', { requestId, error: e instanceof Error ? e.message : e });
  }

  // Optional temperature enrichment
  let temperatureC: number | undefined = asOptionalFiniteNumber(body.currentTemperatureC);
  if (temperatureC == null && WEATHER_API_KEY) {
    try {
      const weather = await fetchTemperatureC({
        apiKey: WEATHER_API_KEY,
        city: body.weatherCity ? String(body.weatherCity) : undefined,
      });
      if (weather) temperatureC = weather.temperatureC;
    } catch (e) {
      warn('predict.weather_failed', { requestId, error: e instanceof Error ? e.message : e });
    }
  }

  info('predict.inputs', { requestId, foodLabel, rekognitionConfidence, temperatureC, userId });

  const predictionResult = await predictExpiry({
    modelId: MODEL_ID,
    foodType: foodLabel,
    storageCondition,
    preparationTime,
    currentTemperatureC: temperatureC,
  });

  if (!predictionResult.ok) {
    warn('predict.bedrock_failed', {
      requestId, foodLabel,
      error: predictionResult.error.message,
      details: predictionResult.error.details,
    });
    return json(200, {
      status: 'FAILED',
      errorCode: 'MODEL_ERROR',
      message: 'Unable to generate an expiry estimate right now. When in doubt, throw it out.',
      requestId,
    });
  }

  const prediction  = predictionResult.value;
  const analysisId  = uuidv4();
  const expiryAt    = new Date(prediction.expiryTimestamp);
  const leadMs      = LEAD_TIME_HOURS * 60 * 60 * 1000;
  const reminderAt  = new Date(Math.max(expiryAt.getTime() - leadMs, Date.now() + 60_000));
  const ttl         = Math.floor((expiryAt.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);

  // BUG FIX: Write userId so list-analyses GSI query works correctly
  await ddbDoc.send(new PutCommand({
    TableName: ANALYSES_TABLE_NAME,
    Item: {
      analysisId,
      userId,                                          // ← was missing
      createdAtIso: new Date().toISOString(),
      s3Key:               body.s3Key ? String(body.s3Key) : undefined,
      foodType:            foodLabel,
      rekognitionConfidence,
      storageCondition,
      preparationTime,
      currentTemperatureC: temperatureC,
      visionScore,
      visionTier,
      visionReason,
      expiryAtIso:         expiryAt.toISOString(),
      reminderAtIso:       reminderAt.toISOString(),
      reminderSent:        false,
      hasPhoneReminder:    Boolean(phoneNumber),       // for UI: show reminder note only when true
      modelConfidence:     prediction.modelConfidence,
      modelExplanation:    prediction.explanation,
      phoneNumber,
      ttl,
    },
  }));

  // Schedule EventBridge reminder (always — even without a phone, marks the item)
  if (REMINDER_ROLE_ARN && REMINDER_LAMBDA_ARN && SCHEDULE_GROUP_NAME) {
    try {
      await schedulerClient.send(new CreateScheduleCommand({
        Name: `analysis-${analysisId}`,
        GroupName: SCHEDULE_GROUP_NAME,
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: toAtExpression(reminderAt),
        Target: {
          Arn: REMINDER_LAMBDA_ARN,
          RoleArn: REMINDER_ROLE_ARN,
          Input: JSON.stringify({ analysisId, phoneNumber, expiryAtIso: expiryAt.toISOString(), foodType: foodLabel }),
        },
      }));
      try {
        await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalRemindersScheduled' });
      } catch {}
    } catch (e) {
      warn('predict.scheduler_failed', { requestId, error: e instanceof Error ? e.message : e });
    }
  }

  // Immediate confirmation SMS (only when phone provided)
  if (phoneNumber) {
    await sendSms({
      phoneNumber,
      dryRun: DRY_RUN_SMS,
      message: `Anna Suraksha: ${foodLabel} — estimated best before ${expiryAt.toLocaleDateString('en-IN')}. Reminder set for ${reminderAt.toLocaleString('en-IN')}.`,
    });
  }

  info('predict.result', { requestId, analysisId, foodLabel, userId, expiryAtIso: expiryAt.toISOString() });

  return json(200, {
    status: 'OK',
    analysisId,
    foodLabel,
    expiryAtIso: expiryAt.toISOString(),
    reminderAtIso: reminderAt.toISOString(),
    hasPhoneReminder: Boolean(phoneNumber),
    model: { modelConfidence: prediction.modelConfidence, explanation: prediction.explanation },
    dryRunSms: DRY_RUN_SMS,
    leadTimeHours: LEAD_TIME_HOURS,
  });
};
