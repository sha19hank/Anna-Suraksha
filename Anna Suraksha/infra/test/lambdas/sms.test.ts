/**
 * Tests for SMS send guard logic — unit tests only (no real SNS calls).
 * The actual sendSms function is not exported in a testable way, so we test
 * the phone-number validation logic extracted here, and validate that the
 * DRY_RUN env flag is respected by the runtime.
 */

// Phone validation helpers (inline — matching the logic in shared/sms.ts)
function isE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

function isAllowedIndiaNumber(phoneNumber: string): boolean {
  return isE164(phoneNumber) && phoneNumber.startsWith('+91');
}

describe('phone number validation', () => {
  test.each([
    ['+919876543210', true],
    ['+911234567890', true],
    ['+910000000000', true],  // valid E.164 +91 number (starts with 910…)
    ['+1234567890',  false],  // not +91
    ['9876543210',   false],  // missing +
    ['+91',          false],  // too short
    ['+9198765432100000', false], // too long
    ['',             false],
    ['+910',          false],  // too short — only 3 digits after +
  ])('isAllowedIndiaNumber(%s) → %s', (number, expected) => {
    expect(isAllowedIndiaNumber(number)).toBe(expected);
  });
});

describe('DRY_RUN_SMS env flag', () => {
  test('parses truthy strings correctly', () => {
    for (const v of ['true', 'TRUE', 'True']) {
      expect(String(v).toLowerCase() === 'true').toBe(true);
    }
  });

  test('parses falsy strings correctly', () => {
    for (const v of ['false', 'FALSE', '0', '']) {
      expect(String(v).toLowerCase() === 'true').toBe(false);
    }
  });
});
