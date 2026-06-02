export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type BaseLog = {
  level: LogLevel;
  message: string;
  requestId?: string;
  at: string;
};

export function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const payload: BaseLog & Record<string, unknown> = {
    level,
    message,
    at: new Date().toISOString(),
    ...(fields ?? {}),
  };

  // CloudWatch best practice: JSON line logs.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export function info(message: string, fields?: Record<string, unknown>): void {
  log('INFO', message, fields);
}

export function warn(message: string, fields?: Record<string, unknown>): void {
  log('WARN', message, fields);
}

export function error(message: string, fields?: Record<string, unknown>): void {
  log('ERROR', message, fields);
}
