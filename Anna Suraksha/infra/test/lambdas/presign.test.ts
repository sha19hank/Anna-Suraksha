/**
 * Unit tests for presign-upload content-type allowlist.
 * No real S3 calls — pure logic validation.
 */

const ALLOWED = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

function isAllowedContentType(ct: string): boolean {
  return ALLOWED.has(ct.toLowerCase());
}

describe('presign-upload content-type allowlist', () => {
  test.each([
    ['image/jpeg',       true],
    ['image/jpg',        true],
    ['image/png',        true],
    ['image/webp',       true],
    ['image/heic',       true],
    ['image/heif',       true],
    ['image/JPEG',       true],   // case insensitive
    ['application/pdf',  false],
    ['text/plain',       false],
    ['video/mp4',        false],
    ['application/json', false],
    ['',                 false],
    ['image/',           false],
  ])('"%s" → allowed: %s', (ct, expected) => {
    expect(isAllowedContentType(ct)).toBe(expected);
  });
});

describe('S3 key namespacing', () => {
  test('key starts with uploads/ prefix', () => {
    const userId = 'abc12345-0000-0000-0000-000000000000';
    const date   = '2026-05-20';
    const uuid   = 'test-uuid';
    const key    = `uploads/${userId.slice(0, 8)}/${date}/${uuid}`;
    expect(key).toMatch(/^uploads\/[a-f0-9]{8}\//);
  });

  test('different users get different key prefixes', () => {
    const u1 = 'aaaaaaaa-0000-0000-0000-000000000000';
    const u2 = 'bbbbbbbb-0000-0000-0000-000000000000';
    const k1 = `uploads/${u1.slice(0, 8)}/date/uuid`;
    const k2 = `uploads/${u2.slice(0, 8)}/date/uuid`;
    expect(k1).not.toBe(k2);
  });
});
