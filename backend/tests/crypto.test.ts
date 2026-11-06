import { generateNumericOtp, randomBookingCode, sha256, timingSafeEqual } from '../src/lib/crypto';

describe('crypto helpers', () => {
  it('generates a numeric OTP of the requested length', () => {
    const otp = generateNumericOtp(6);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('hashes deterministically', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('compares strings in constant time', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('generates readable booking codes', () => {
    const code = randomBookingCode();
    expect(code).toMatch(/^EVR-[A-Z2-9]{8}$/);
  });
});
