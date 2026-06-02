import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

import { warn, info } from './logger';

const sns = new SNSClient({});

function isE164(phoneNumber: string): boolean {
  // E.164 max 15 digits after '+'; first digit cannot be 0.
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

function isAllowedIndiaNumber(phoneNumber: string): boolean {
  return isE164(phoneNumber) && phoneNumber.startsWith('+91');
}

export async function sendSms(params: { phoneNumber: string; message: string; dryRun: boolean }): Promise<void> {
  const { phoneNumber, message, dryRun } = params;

  if (!isAllowedIndiaNumber(phoneNumber)) {
    warn('sms.blocked_number', {
      phoneNumber,
      reason: 'Only +91 E.164 numbers are allowed in MVP',
      dryRun,
    });
    return;
  }

  if (dryRun) {
    info('sms.dry_run', { phoneNumber, messageLength: message.length });
    return;
  }

  await sns.send(
    new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
    })
  );
}
