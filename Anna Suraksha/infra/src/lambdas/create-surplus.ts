import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

import { ddbDoc } from '../shared/dynamo';
import { badRequest, json } from '../shared/http';
import { sendSms } from '../shared/sms';
import { info, warn } from '../shared/logger';
import { isNonEmptyString, safeJsonParseBody } from '../shared/validate';

const SURPLUS_TABLE_NAME  = process.env.SURPLUS_TABLE_NAME;
const NGO_TABLE_NAME      = process.env.NGO_TABLE_NAME;
const DRY_RUN_SMS         = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';

// BUG FIX: Changed from APIGatewayProxyHandlerV2 → WithJWTAuthorizer
// so userId can be stored on the listing for ownership tracking.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!SURPLUS_TABLE_NAME) return json(500, { message: 'Missing SURPLUS_TABLE_NAME' });
  if (!NGO_TABLE_NAME)     return json(500, { message: 'Missing NGO_TABLE_NAME' });

  const requestId = event.requestContext?.requestId;
  const userId    = event.requestContext.authorizer.jwt.claims['sub'] as string;
  info('surplus.request', { requestId, userId });

  const parsed = safeJsonParseBody(event.body);
  if (!parsed.ok) return badRequest(parsed.message);
  const body = parsed.value;

  // BUG FIX: Validate all fields that the UI treats as required
  if (!isNonEmptyString(body?.restaurantName)) return badRequest('restaurantName is required');
  if (!isNonEmptyString(body?.region))         return badRequest('region is required');
  if (!isNonEmptyString(body?.foodSummary))    return badRequest('foodSummary is required');
  if (!isNonEmptyString(body?.quantity))       return badRequest('quantity is required');
  if (!isNonEmptyString(body?.pickupByIso))    return badRequest('pickupByIso is required');
  if (!isNonEmptyString(body?.contactPhone))   return badRequest('contactPhone is required');

  const restaurantName = String(body.restaurantName).trim();
  const region         = String(body.region).trim();
  const foodSummary    = String(body.foodSummary).trim();
  const quantity       = String(body.quantity).trim();
  const pickupByIso    = String(body.pickupByIso).trim();
  const contactPhone   = String(body.contactPhone).trim();

  if (restaurantName.length > 128) return badRequest('restaurantName is too long');
  if (region.length > 64)          return badRequest('region is too long');
  if (foodSummary.length > 500)    return badRequest('foodSummary is too long');
  if (Number.isNaN(Date.parse(pickupByIso))) return badRequest('pickupByIso must be a valid ISO date string');
  if (new Date(pickupByIso) < new Date()) return badRequest('pickupByIso must be in the future');

  const listingId    = uuidv4();
  const createdAtIso = new Date().toISOString();

  await ddbDoc.send(new PutCommand({
    TableName: SURPLUS_TABLE_NAME,
    Item: {
      listingId,
      userId,            // ← now stored for ownership tracking
      createdAtIso,
      restaurantName,
      region,
      foodSummary,
      quantity,
      pickupByIso,
      contactPhone,
      status: 'OPEN',
    },
  }));

  // BUG FIX: Use QueryCommand (not ScanCommand) — NGO table has region as PK
  // Scan was O(full table); Query is O(results in region).
  const ngoResp = await ddbDoc.send(new QueryCommand({
    TableName: NGO_TABLE_NAME,
    KeyConditionExpression: '#r = :region',
    ExpressionAttributeNames: { '#r': 'region' },
    ExpressionAttributeValues: { ':region': region },
    ProjectionExpression: 'phoneNumber, ngoName',
  }));

  const ngos = (ngoResp.Items ?? []) as Array<{ phoneNumber?: string; ngoName?: string }>;
  const msg = `🍱 Surplus alert (${region}): "${restaurantName}" has ${foodSummary} (${quantity}). Pickup by ${new Date(pickupByIso).toLocaleString('en-IN')}. Contact: ${contactPhone}`;

  let notified = 0;
  for (const ngo of ngos) {
    if (!ngo.phoneNumber) continue;
    try {
      await sendSms({ phoneNumber: ngo.phoneNumber, message: msg, dryRun: DRY_RUN_SMS });
      notified++;
    } catch (e) {
      warn('surplus.sms_failed', { requestId, ngo: ngo.ngoName, error: e instanceof Error ? e.message : e });
    }
  }

  info('surplus.result', { requestId, listingId, userId, region, notified });
  return json(201, { status: 'OK', listingId, notified });
};
