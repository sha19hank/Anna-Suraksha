import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { json } from '../shared/http';
import { info } from '../shared/logger';

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;
const PAGE_LIMIT = 20;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!ANALYSES_TABLE_NAME) return json(500, { message: 'Missing ANALYSES_TABLE_NAME' });

  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const nextToken = event.queryStringParameters?.nextToken;

  info('listAnalyses.request', { userId });

  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
    } catch {
      return json(400, { message: 'Invalid nextToken' });
    }
  }

  const result = await ddbDoc.send(
    new QueryCommand({
      TableName: ANALYSES_TABLE_NAME,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false, // newest first
      Limit: PAGE_LIMIT,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const items = (result.Items ?? []).map(({ ttl, phoneNumber, ...safe }) => safe);

  const responseNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return json(200, { analyses: items, nextToken: responseNextToken, count: items.length });
};
