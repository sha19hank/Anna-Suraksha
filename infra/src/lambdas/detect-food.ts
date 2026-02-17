import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';

import { badRequest, json } from '../shared/http';
import { getAdaptiveQuestions } from '../domain/hybrid';
import { info, warn } from '../shared/logger';
import { incrementMetric } from '../shared/metrics';

const rekognition = new RekognitionClient({});

const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME;

function isUsefulLabel(label: string, confidence: number): boolean {
  if (!label || label.toLowerCase() === 'unknown') return false;
  // Keep MVP simple: treat low-confidence labels as not useful.
  return confidence >= 50;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!UPLOAD_BUCKET_NAME) return json(500, { message: 'Missing UPLOAD_BUCKET_NAME' });

  const requestId = event.requestContext?.requestId;
  info('detect.request', { requestId });

  const body = event.body ? JSON.parse(event.body) : null;
  if (!body?.key) return badRequest('key (S3 object key) is required');

  const s3Key = String(body.key);

  try {
    await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalDetections' });
  } catch (e) {
    warn('detect.metric_failed', { requestId, error: e instanceof Error ? e.message : e });
  }

  const detect = await rekognition.send(
    new DetectLabelsCommand({
      Image: { S3Object: { Bucket: UPLOAD_BUCKET_NAME, Name: s3Key } },
      MaxLabels: 10,
      MinConfidence: 40,
    })
  );

  const top = (detect.Labels ?? []).sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))[0];
  const detectedLabel = top?.Name ?? '';
  const detectedConfidence = Number(top?.Confidence ?? 0);

  const foodLabel = isUsefulLabel(detectedLabel, detectedConfidence) ? detectedLabel : 'Unknown';
  const confidence = isUsefulLabel(detectedLabel, detectedConfidence) ? detectedConfidence : 0;

  if (foodLabel === 'Unknown') {
    warn('detect.no_useful_label', { requestId, s3Key, detectedLabel, detectedConfidence });
  }

  info('detect.result', { requestId, s3Key, foodLabel, confidence });

  const adaptive = getAdaptiveQuestions(foodLabel, confidence);

  return json(200, {
    status: adaptive.shouldAsk ? 'NEED_INFO' : 'OK',
    s3Key,
    foodLabel,
    confidence,
    category: adaptive.category,
    questions: adaptive.questions,
  });
};
