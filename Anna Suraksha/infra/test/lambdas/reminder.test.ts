/**
 * Unit tests for reminder message formatting logic (send-reminder lambda).
 */

function formatExpiryReadable(expiryAtIso: string): string {
  const d = new Date(expiryAtIso);
  const hoursLeft = Math.round((d.getTime() - Date.now()) / 3600000);
  if (hoursLeft <= 0) return 'now (use or discard)';
  if (hoursLeft < 24) return `in ~${hoursLeft}h`;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildReminderMessage(foodType: string | undefined, expiryAtIso: string): string {
  const food = foodType ?? 'Your food item';
  return `⏰ Anna Suraksha reminder: ${food} expires ${formatExpiryReadable(expiryAtIso)}. Use it now or consider donating as surplus!`;
}

describe('formatExpiryReadable', () => {
  test('already expired → "now (use or discard)"', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(formatExpiryReadable(past)).toBe('now (use or discard)');
  });

  test('3 hours away → "in ~3h"', () => {
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    expect(formatExpiryReadable(soon)).toContain('in ~3h');
  });

  test('2 days away → locale date string (not hours)', () => {
    const future = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const result = formatExpiryReadable(future);
    expect(result).not.toContain('in ~');
  });
});

describe('buildReminderMessage', () => {
  test('includes food name when provided', () => {
    const msg = buildReminderMessage('Milk', new Date(Date.now() + 3_600_000).toISOString());
    expect(msg).toContain('Milk');
    expect(msg).toContain('Anna Suraksha');
  });

  test('uses fallback when foodType is undefined', () => {
    const msg = buildReminderMessage(undefined, new Date(Date.now() + 3_600_000).toISOString());
    expect(msg).toContain('Your food item');
  });

  test('always includes surplus suggestion', () => {
    const msg = buildReminderMessage('Rice', new Date(Date.now() + 3_600_000).toISOString());
    expect(msg).toContain('surplus');
  });
});
