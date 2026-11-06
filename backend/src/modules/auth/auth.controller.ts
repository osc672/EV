import { Request, Response } from 'express';
import { created, ok } from '../../lib/response';
import { asyncHandler } from '../../lib/asyncHandler';
import * as authService from './auth.service';
import { env, isProd } from '../../config/env';
import { UnauthorizedError } from '../../lib/errors';

const REFRESH_COOKIE = 'evr_refresh';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

function readRefreshToken(req: Request): string | undefined {
  const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  return bodyToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body, req);
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  return created(res, result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, req);
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  return ok(res, result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = readRefreshToken(req);
  if (!token) throw new UnauthorizedError('Missing refresh token');
  const result = await authService.refresh(token, req);
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  return ok(res, result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(readRefreshToken(req));
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  return ok(res, { message: 'Logged out' });
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  return ok(res, { message: 'Logged out from all devices' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await authService.getMe(req.user!.id));
});

export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const devCode = await authService.requestOtp(req.body);
  return ok(res, {
    message: 'OTP sent',
    ...(env.OTP_DEBUG_RETURN_CODE && devCode ? { devCode } : {}),
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.verifyOtp(req.body, req);
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  return ok(res, result);
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body as { phone: string };
  const devCode = await authService.createOtp(phone, 'PASSWORD_RESET');
  return ok(res, {
    message: 'If the account exists, a reset code has been sent',
    ...(env.OTP_DEBUG_RETURN_CODE && devCode ? { devCode } : {}),
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body);
  return ok(res, { message: 'Password reset successful' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.changePassword(
    req.user!.id,
    req.body.currentPassword,
    req.body.newPassword,
  );
  return ok(res, { message: 'Password changed' });
});
