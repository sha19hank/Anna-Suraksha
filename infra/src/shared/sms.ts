import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});

export async function sendSms(params: { phoneNumber: string; message: string; dryRun: boolean }): Promise<void> {
  const { phoneNumber, message, dryRun } = params;

  if (dryRun) {
    console.log('[DRY_RUN_SMS] skipping SNS Publish', { phoneNumber, message });
    return;
  }

  await sns.send(
    new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
    })
  );
}
