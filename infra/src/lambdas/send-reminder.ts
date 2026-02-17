import type { Handler } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { sendSms } from '../shared/sms';
import { info, warn } from '../shared/logger';

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;
const DRY_RUN_SMS = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';

export const handler: Handler = async (event) => {
  if (!ANALYSES_TABLE_NAME) throw new Error('Missing ANALYSES_TABLE_NAME');

  const analysisId = event?.analysisId as string | undefined;
  const phoneNumber = event?.phoneNumber as string | undefined;
  const expiryAtIso = event?.expiryAtIso as string | undefined;

  if (!analysisId) throw new Error('Missing analysisId');

  info('reminder.invoke', { analysisId, hasPhone: Boolean(phoneNumber), expiryAtIso });

  if (phoneNumber) {
    try {
      await sendSms({
        phoneNumber,
        dryRun: DRY_RUN_SMS,
        message: `Reminder from Anna Suraksha: estimated expiry time is ${expiryAtIso ?? 'soon'}.`,
      });
    } catch (e) {
      warn('reminder.sms_failed', { analysisId, error: e instanceof Error ? e.message : e });
    }
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
