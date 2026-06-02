export function safeJsonParseBody(body: string | undefined): { ok: true; value: any } | { ok: false; message: string } {
  if (!body) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, message: 'Request body must be valid JSON' };
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function asOptionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}
