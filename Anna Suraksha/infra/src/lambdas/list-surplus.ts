import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { json } from '../shared/http';
import { info } from '../shared/logger';

const SURPLUS_TABLE_NAME = process.env.SURPLUS_TABLE_NAME;
const PAGE_LIMIT = 30;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!SURPLUS_TABLE_NAME) return json(500, { message: 'Missing SURPLUS_TABLE_NAME' });

  const region = event.queryStringParameters?.region;
  const status = event.queryStringParameters?.status ?? 'OPEN';
  const nextToken = event.queryStringParameters?.nextToken;

  info('listSurplus.request', { region, status });

  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
    } catch {
      return json(400, { message: 'Invalid nextToken' });
    }
  }

  let items: Record<string, unknown>[];
  let lastKey: Record<string, unknown> | undefined;

  if (region) {
    // Efficient: query the region-status GSI
    const result = await ddbDoc.send(
      new QueryCommand({
        TableName: SURPLUS_TABLE_NAME,
        IndexName: 'region-status-index',
        KeyConditionExpression: '#r = :region AND #s = :status',
        ExpressionAttributeNames: { '#r': 'region', '#s': 'status' },
        ExpressionAttributeValues: { ':region': region, ':status': status },
        ScanIndexForward: false,
        Limit: PAGE_LIMIT,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items = result.Items as Record<string, unknown>[] ?? [];
    lastKey = result.LastEvaluatedKey;
  } else {
    // No region filter — scan with status filter (acceptable for MVP volumes)
    const result = await ddbDoc.send(
      new ScanCommand({
        TableName: SURPLUS_TABLE_NAME,
        FilterExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': status },
        Limit: PAGE_LIMIT,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items = result.Items as Record<string, unknown>[] ?? [];
    lastKey = result.LastEvaluatedKey;
  }

  // Filter out listings already past pickup time
  const now = new Date().toISOString();
  const active = items.filter((i) => !i.pickupByIso || String(i.pickupByIso) > now);

  const responseNextToken = lastKey
    ? Buffer.from(JSON.stringify(lastKey)).toString('base64url')
    : undefined;

  return json(200, { listings: active, nextToken: responseNextToken, count: active.length });
};
