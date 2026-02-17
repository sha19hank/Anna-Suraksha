import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDoc } from './dynamo';

export async function incrementMetric(params: {
  metricsTableName?: string;
  metricName: 'totalDetections' | 'totalPredictions' | 'totalRemindersScheduled';
  delta?: number;
}): Promise<void> {
  const { metricsTableName, metricName, delta = 1 } = params;
  if (!metricsTableName) return;

  await ddbDoc.send(
    new UpdateCommand({
      TableName: metricsTableName,
      Key: { metricName },
      UpdateExpression: 'ADD #c :d SET updatedAtIso = :now',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: {
        ':d': delta,
        ':now': new Date().toISOString(),
      },
    })
  );
}
