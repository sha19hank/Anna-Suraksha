import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

import { ddbDoc } from '../shared/dynamo';
import { badRequest, json } from '../shared/http';
import { sendSms } from '../shared/sms';

const SURPLUS_TABLE_NAME = process.env.SURPLUS_TABLE_NAME;
const NGO_TABLE_NAME = process.env.NGO_TABLE_NAME;
const DRY_RUN_SMS = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!SURPLUS_TABLE_NAME) return json(500, { message: 'Missing SURPLUS_TABLE_NAME' });
  if (!NGO_TABLE_NAME) return json(500, { message: 'Missing NGO_TABLE_NAME' });

  const body = event.body ? JSON.parse(event.body) : null;
  if (!body?.restaurantName) return badRequest('restaurantName is required');
  if (!body?.region) return badRequest('region is required');
  if (!body?.pickupByIso) return badRequest('pickupByIso is required');

  const listingId = uuidv4();
  const createdAtIso = new Date().toISOString();

  await ddbDoc.send(
    new PutCommand({
      TableName: SURPLUS_TABLE_NAME,
      Item: {
        listingId,
        createdAtIso,
        restaurantName: String(body.restaurantName),
        region: String(body.region),
        foodSummary: body.foodSummary ? String(body.foodSummary) : undefined,
        quantity: body.quantity ? String(body.quantity) : undefined,
        pickupByIso: String(body.pickupByIso),
        contactPhone: body.contactPhone ? String(body.contactPhone) : undefined,
        status: 'OPEN',
      },
    })
  );

  // MVP: scan NGO table and SMS notify matching region.
  // For scale, replace with Query on region partition key.
  const ngoResp = await ddbDoc.send(
    new ScanCommand({
      TableName: NGO_TABLE_NAME,
      FilterExpression: '#r = :region',
      ExpressionAttributeNames: { '#r': 'region' },
      ExpressionAttributeValues: { ':region': String(body.region) },
      ProjectionExpression: 'phoneNumber, ngoName',
    })
  );

  const ngos = (ngoResp.Items ?? []) as Array<{ phoneNumber?: string; ngoName?: string }>;
  const msg = `Surplus alert (${body.region}): ${body.restaurantName} offers ${body.foodSummary ?? 'food'} ${body.quantity ?? ''}. Pickup by ${body.pickupByIso}. Contact: ${body.contactPhone ?? 'N/A'}`;

  for (const ngo of ngos) {
    if (!ngo.phoneNumber) continue;
    await sendSms({ phoneNumber: ngo.phoneNumber, message: msg, dryRun: DRY_RUN_SMS });
  }

  return json(200, { status: 'OK', listingId, notified: ngos.length });
};
