import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

import { badRequest, json } from '../shared/http';
import { info } from '../shared/logger';
import { isNonEmptyString, safeJsonParseBody } from '../shared/validate';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;

// Allowed image MIME types — prevents presigned URLs for arbitrary file types
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!BUCKET_NAME) return json(500, { message: 'Missing UPLOAD_BUCKET_NAME' });

  const requestId = event.requestContext?.requestId;
  const userId    = event.requestContext.authorizer.jwt.claims['sub'] as string;
  info('uploadUrl.request', { requestId, userId });

  const parsed = safeJsonParseBody(event.body);
  if (!parsed.ok) return badRequest(parsed.message);

  const body = parsed.value;
  const contentType = body?.contentType;
  if (!isNonEmptyString(contentType)) return badRequest('contentType is required');

  // BUG FIX: Validate content type to prevent presigned URLs for non-image files
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    return badRequest(`contentType must be one of: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`);
  }

  // Namespace by userId so users can't overwrite each other's uploads
  const objectKey = `uploads/${userId.slice(0, 8)}/${new Date().toISOString().slice(0, 10)}/${uuidv4()}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:      BUCKET_NAME,
      Key:         objectKey,
      ContentType: contentType,
    }),
    { expiresIn: 300 }   // 5 minutes
  );

  info('uploadUrl.result', { requestId, userId, key: objectKey });
  return json(200, { key: objectKey, uploadUrl: url, expiresInSeconds: 300 });
};
