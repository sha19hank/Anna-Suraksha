import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';

import { badRequest, json } from '../shared/http';
import { getAdaptiveQuestions } from '../domain/hybrid';

const rekognition = new RekognitionClient({});

const UPLOAD_BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!UPLOAD_BUCKET_NAME) return json(500, { message: 'Missing UPLOAD_BUCKET_NAME' });

  const body = event.body ? JSON.parse(event.body) : null;
  if (!body?.key) return badRequest('key (S3 object key) is required');

  const s3Key = String(body.key);

  const detect = await rekognition.send(
    new DetectLabelsCommand({
      Image: { S3Object: { Bucket: UPLOAD_BUCKET_NAME, Name: s3Key } },
      MaxLabels: 10,
      MinConfidence: 40,
    })
  );

  const top = (detect.Labels ?? []).sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))[0];
  const foodLabel = top?.Name ?? 'Unknown';
  const confidence = Number(top?.Confidence ?? 0);

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
