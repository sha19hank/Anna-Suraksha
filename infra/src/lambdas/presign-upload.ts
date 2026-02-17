import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { badRequest, json } from '../shared/http';
import { info } from '../shared/logger';

const s3 = new S3Client({});

const BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!BUCKET_NAME) return json(500, { message: 'Missing UPLOAD_BUCKET_NAME' });

  const requestId = event.requestContext?.requestId;
  info('uploadUrl.request', { requestId });

  const body = event.body ? JSON.parse(event.body) : {};
  const contentType = body?.contentType as string | undefined;
  if (!contentType) return badRequest('contentType is required');

  const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${uuidv4()}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 5 }
  );

  info('uploadUrl.result', { requestId, key: objectKey });
  return json(200, { bucket: BUCKET_NAME, key: objectKey, uploadUrl: url, expiresInSeconds: 300 });
};
