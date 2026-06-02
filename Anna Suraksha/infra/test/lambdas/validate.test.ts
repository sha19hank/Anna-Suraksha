import {
  safeJsonParseBody,
  isNonEmptyString,
  asOptionalFiniteNumber,
  asOptionalString,
} from '../../src/shared/validate';

describe('safeJsonParseBody', () => {
  test('undefined body → ok: true, value: null', () => {
    expect(safeJsonParseBody(undefined)).toEqual({ ok: true, value: null });
  });

  test('valid JSON → ok: true with parsed value', () => {
    const r = safeJsonParseBody('{"key":"val"}');
    expect(r).toEqual({ ok: true, value: { key: 'val' } });
  });

  test('invalid JSON → ok: false', () => {
    const r = safeJsonParseBody('{bad json}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });

  test('empty string → ok: true, value: null', () => {
    expect(safeJsonParseBody('')).toEqual({ ok: true, value: null });
  });
});

describe('isNonEmptyString', () => {
  test.each([
    ['hello', true],
    ['  ',    false],
    ['',      false],
    [null,    false],
    [0,       false],
    [true,    false],
  ])('%j → %s', (input, expected) => {
    expect(isNonEmptyString(input)).toBe(expected);
  });
});

describe('asOptionalFiniteNumber', () => {
  test('null → undefined', () => expect(asOptionalFiniteNumber(null)).toBeUndefined());
  test('undefined → undefined', () => expect(asOptionalFiniteNumber(undefined)).toBeUndefined());
  test('number 42 → 42', () => expect(asOptionalFiniteNumber(42)).toBe(42));
  test('string "3.5" → 3.5', () => expect(asOptionalFiniteNumber('3.5')).toBe(3.5));
  test('Infinity → undefined', () => expect(asOptionalFiniteNumber(Infinity)).toBeUndefined());
  test('NaN → undefined', () => expect(asOptionalFiniteNumber(NaN)).toBeUndefined());
  test('"abc" → undefined', () => expect(asOptionalFiniteNumber('abc')).toBeUndefined());
});

describe('asOptionalString', () => {
  test('non-empty string → same string', () => expect(asOptionalString('hello')).toBe('hello'));
  test('empty string → undefined', () => expect(asOptionalString('')).toBeUndefined());
  test('whitespace → undefined', () => expect(asOptionalString('  ')).toBeUndefined());
  test('null → undefined', () => expect(asOptionalString(null)).toBeUndefined());
  test('number → undefined', () => expect(asOptionalString(42)).toBeUndefined());
});
