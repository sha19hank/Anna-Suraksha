import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';

import { badRequest, json } from '../shared/http';
import { getAdaptiveQuestions } from '../domain/hybrid';
import { info, warn } from '../shared/logger';
import { incrementMetric } from '../shared/metrics';
import { isNonEmptyString, safeJsonParseBody } from '../shared/validate';
import { scoreFreshnessFromImage, freshnessLabel, freshnessEmoji } from '../shared/bedrock-vision';

const rekognition = new RekognitionClient({});

const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME;

function isUsefulLabel(label: string, confidence: number): boolean {
  if (!label || label.toLowerCase() === 'unknown') return false;
  return confidence >= 50;
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!UPLOAD_BUCKET_NAME) return json(500, { message: 'Missing UPLOAD_BUCKET_NAME' });

  const requestId = event.requestContext?.requestId;
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  info('detect.request', { requestId, userId });

  const parsed = safeJsonParseBody(event.body);
  if (!parsed.ok) return badRequest(parsed.message);
  const body = parsed.value;
  if (!isNonEmptyString(body?.key)) return badRequest('key (S3 object key) is required');

  const s3Key = String(body.key);
  if (s3Key.length > 1024) return badRequest('key is too long');

  try {
    await incrementMetric({ metricsTableName: METRICS_TABLE_NAME, metricName: 'totalDetections' });
  } catch (e) {
    warn('detect.metric_failed', { requestId, error: e instanceof Error ? e.message : e });
  }

  // ── Rekognition label detection ──────────────────────────────────────────
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

  // ── Phase 3: Bedrock vision freshness scoring ────────────────────────────
  let freshnessScore: number | undefined;
  let freshnessReason: string | undefined;
  let freshnessTier: string | undefined;
  let freshnessIcon: string | undefined;

  try {
    const vision = await scoreFreshnessFromImage({ bucketName: UPLOAD_BUCKET_NAME, s3Key });
    if (vision.ok) {
      freshnessScore  = vision.score;
      freshnessReason = vision.reason;
      freshnessTier   = freshnessLabel(vision.score);
      freshnessIcon   = freshnessEmoji(vision.score);
      info('detect.vision', { requestId, score: freshnessScore, tier: freshnessTier });
    } else {
      warn('detect.vision_failed', { requestId, error: vision.error });
    }
  } catch (e: any) {
    warn('detect.vision_exception', { requestId, error: e.message });
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
    // Phase 3 visual freshness
    vision: freshnessScore != null ? {
      score: freshnessScore,
      tier: freshnessTier,
      icon: freshnessIcon,
      reason: freshnessReason,
    } : null,
  });
};
