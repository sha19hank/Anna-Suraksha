import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { json } from '../shared/http';
import { info, warn } from '../shared/logger';

const SURPLUS_TABLE_NAME = process.env.SURPLUS_TABLE_NAME;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!SURPLUS_TABLE_NAME) return json(500, { message: 'Missing SURPLUS_TABLE_NAME' });

  const listingId = event.pathParameters?.listingId;
  if (!listingId) return json(400, { message: 'listingId path parameter is required' });

  const claimedByUserId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const claimedByEmail = event.requestContext.authorizer.jwt.claims['email'] as string | undefined;

  info('claimSurplus.request', { listingId, claimedByUserId });

  // Fetch the listing first to validate state
  const existing = await ddbDoc.send(
    new GetCommand({ TableName: SURPLUS_TABLE_NAME, Key: { listingId } })
  );

  if (!existing.Item) {
    return json(404, { message: 'Listing not found' });
  }

  if (existing.Item.status !== 'OPEN') {
    warn('claimSurplus.alreadyClaimed', { listingId, status: existing.Item.status });
    return json(409, { message: `Listing is already ${existing.Item.status}` });
  }

  const pickupByIso = existing.Item.pickupByIso as string | undefined;
  if (pickupByIso && new Date(pickupByIso) < new Date()) {
    return json(410, { message: 'Listing has expired — pickup window has passed' });
  }

  // Conditional update: only succeed if status is still OPEN (prevents race)
  try {
    await ddbDoc.send(
      new UpdateCommand({
        TableName: SURPLUS_TABLE_NAME,
        Key: { listingId },
        UpdateExpression:
          'SET #s = :claimed, claimedByUserId = :uid, claimedByEmail = :email, claimedAtIso = :now',
        ConditionExpression: '#s = :open',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':claimed': 'CLAIMED',
          ':open': 'OPEN',
          ':uid': claimedByUserId,
          ':email': claimedByEmail ?? null,
          ':now': new Date().toISOString(),
        },
      })
    );
  } catch (e: any) {
    if (e.name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'Listing was just claimed by someone else' });
    }
    throw e;
  }

  info('claimSurplus.success', { listingId, claimedByUserId });

  return json(200, {
    status: 'OK',
    listingId,
    claimedByUserId,
    claimedAtIso: new Date().toISOString(),
  });
};
