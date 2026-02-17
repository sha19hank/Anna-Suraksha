import type { Handler } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

import { ddbDoc } from '../shared/dynamo';

const sns = new SNSClient({});

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;

export const handler: Handler = async (event) => {
  if (!ANALYSES_TABLE_NAME) throw new Error('Missing ANALYSES_TABLE_NAME');

  const analysisId = event?.analysisId as string | undefined;
  const phoneNumber = event?.phoneNumber as string | undefined;
  const expiryAtIso = event?.expiryAtIso as string | undefined;

  if (!analysisId) throw new Error('Missing analysisId');

  if (phoneNumber) {
    await sns.send(
      new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: `Reminder from Anna Suraksha: estimated expiry time is ${expiryAtIso ?? 'soon'}.`,
      })
    );
  }

  await ddbDoc.send(
    new UpdateCommand({
      TableName: ANALYSES_TABLE_NAME,
      Key: { analysisId },
      UpdateExpression: 'SET reminderSentAtIso = :now, reminderSent = :true',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
        ':true': true,
      },
    })
  );

  return { ok: true };
};
