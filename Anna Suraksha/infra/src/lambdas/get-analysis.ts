import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { json } from '../shared/http';
import { info, warn } from '../shared/logger';

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!ANALYSES_TABLE_NAME) return json(500, { message: 'Missing ANALYSES_TABLE_NAME' });

  const analysisId = event.pathParameters?.analysisId;
  if (!analysisId) return json(400, { message: 'analysisId path parameter is required' });

  const requestingUserId = event.requestContext.authorizer.jwt.claims['sub'] as string;

  info('getAnalysis.request', { analysisId, requestingUserId });

  const result = await ddbDoc.send(
    new GetCommand({ TableName: ANALYSES_TABLE_NAME, Key: { analysisId } })
  );

  if (!result.Item) {
    return json(404, { message: 'Analysis not found' });
  }

  // Users may only read their own analyses (unless item has no userId — legacy)
  if (result.Item.userId && result.Item.userId !== requestingUserId) {
    warn('getAnalysis.forbidden', { analysisId, requestingUserId, ownerId: result.Item.userId });
    return json(403, { message: 'Forbidden' });
  }

  // Strip internal fields before returning
  const { ttl, phoneNumber, ...safe } = result.Item;

  return json(200, { analysis: safe });
};
