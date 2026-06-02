import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { json } from '../shared/http';
import { info } from '../shared/logger';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const requestId = event.requestContext?.requestId;
  info('health', { requestId });
  return json(200, { ok: true, service: 'anna-suraksha', at: new Date().toISOString() });
};
