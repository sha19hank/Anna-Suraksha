/**
 * Unit tests for surplus business logic.
 * Tests validation rules and status transitions.
 */

// ── Listing validation (mirrors create-surplus lambda logic) ──────────────

function validatePickupTime(pickupByIso: string): { ok: boolean; reason?: string } {
  const d = Date.parse(pickupByIso);
  if (isNaN(d)) return { ok: false, reason: 'Invalid ISO date' };
  if (d <= Date.now()) return { ok: false, reason: 'Pickup time must be in the future' };
  return { ok: true };
}

function isExpiredListing(pickupByIso: string): boolean {
  return new Date(pickupByIso) < new Date();
}

// ── Status transition rules ───────────────────────────────────────────────

type Status = 'OPEN' | 'CLAIMED';

function canClaim(status: Status, pickupByIso: string): { allowed: boolean; reason?: string } {
  if (status !== 'OPEN') return { allowed: false, reason: `Listing is already ${status}` };
  if (isExpiredListing(pickupByIso)) return { allowed: false, reason: 'Listing pickup window has passed' };
  return { allowed: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('validatePickupTime', () => {
  test('future ISO date → ok', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(validatePickupTime(future).ok).toBe(true);
  });

  test('past ISO date → error', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const r = validatePickupTime(past);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('future');
  });

  test('invalid string → error', () => {
    const r = validatePickupTime('not-a-date');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Invalid');
  });

  test('empty string → error', () => {
    expect(validatePickupTime('').ok).toBe(false);
  });
});

describe('canClaim', () => {
  const future = new Date(Date.now() + 7_200_000).toISOString();
  const past   = new Date(Date.now() - 3_600_000).toISOString();

  test('OPEN + future → allowed', () => {
    expect(canClaim('OPEN', future).allowed).toBe(true);
  });

  test('CLAIMED + future → not allowed', () => {
    const r = canClaim('CLAIMED', future);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('CLAIMED');
  });

  test('OPEN + expired pickup → not allowed', () => {
    const r = canClaim('OPEN', past);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('passed');
  });
});

describe('isExpiredListing', () => {
  test('future date → not expired', () => {
    expect(isExpiredListing(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  test('past date → expired', () => {
    expect(isExpiredListing(new Date(Date.now() - 60_000).toISOString())).toBe(true);
  });
});
