import type { Handler } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ddbDoc } from '../shared/dynamo';
import { sendSms } from '../shared/sms';
import { info, warn } from '../shared/logger';

const ANALYSES_TABLE_NAME = process.env.ANALYSES_TABLE_NAME;
const DRY_RUN_SMS = String(process.env.DRY_RUN_SMS ?? 'true').toLowerCase() === 'true';

// EventBridge Scheduler invokes this with { analysisId, phoneNumber?, expiryAtIso, foodType? }
export const handler: Handler = async (event) => {
  if (!ANALYSES_TABLE_NAME) throw new Error('Missing ANALYSES_TABLE_NAME');

  const analysisId  = event?.analysisId  as string | undefined;
  const phoneNumber = event?.phoneNumber as string | undefined;
  const expiryAtIso = event?.expiryAtIso as string | undefined;
  const foodType    = event?.foodType    as string | undefined;

  if (!analysisId) throw new Error('Missing analysisId in scheduler payload');

  info('reminder.invoke', { analysisId, hasPhone: Boolean(phoneNumber), expiryAtIso, foodType });

  if (phoneNumber) {
    try {
      // BUG FIX: Human-readable date/time instead of raw ISO string
      let expiryReadable = 'soon';
      if (expiryAtIso) {
        const d = new Date(expiryAtIso);
        const hoursLeft = Math.round((d.getTime() - Date.now()) / 3600000);
        if (hoursLeft <= 0) {
          expiryReadable = 'now (use or discard)';
        } else if (hoursLeft < 24) {
          expiryReadable = `in ~${hoursLeft}h (${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})`;
        } else {
          expiryReadable = d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        }
      }

      const food = foodType ? `${foodType}` : 'Your food item';
      await sendSms({
        phoneNumber,
        dryRun: DRY_RUN_SMS,
        message: `⏰ Anna Suraksha reminder: ${food} expires ${expiryReadable}. Use it now or consider donating as surplus!`,
      });
    } catch (e) {
      warn('reminder.sms_failed', { analysisId, error: e instanceof Error ? e.message : e });
    }
  }

  // Mark the analysis as reminder-sent in DynamoDB
  try {
    await ddbDoc.send(new UpdateCommand({
      TableName: ANALYSES_TABLE_NAME,
      Key: { analysisId },
      UpdateExpression: 'SET reminderSentAtIso = :now, reminderSent = :true',
      ExpressionAttributeValues: {
        ':now':  new Date().toISOString(),
        ':true': true,
      },
    }));
  } catch (e) {
    warn('reminder.ddb_update_failed', { analysisId, error: e instanceof Error ? e.message : e });
    // Don't re-throw — SMS was already sent; DDB update failure is non-critical
  }

  return { ok: true, analysisId };
};
