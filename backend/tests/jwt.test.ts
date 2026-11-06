import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/lib/jwt';

describe('jwt helpers', () => {
  it('signs and verifies access tokens', () => {
    const token = signAccessToken('user-1', 'DRIVER');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('DRIVER');
    expect(payload.type).toBe('access');
  });

  it('signs and verifies refresh tokens', () => {
    const token = signRefreshToken('user-1', 'token-1');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toBe('token-1');
    expect(payload.type).toBe('refresh');
  });

  it('rejects a refresh token used as an access token', () => {
    const token = signRefreshToken('user-1', 'token-1');
    expect(() => verifyAccessToken(token)).toThrow();
  });
});
