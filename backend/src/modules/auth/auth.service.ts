import bcrypt from 'bcryptjs';
import { Request } from 'express';
import { OtpPurpose, Role, User } from '../../generated/prisma';
import { prisma } from '../../lib/prisma';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../lib/errors';
import { generateNumericOtp, sha256 } from '../../lib/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { env } from '../../config/env';
import { smsProvider } from '../../lib/sms';
import { logger } from '../../lib/logger';
import { addMinutes } from '../../lib/time';
import {
  LoginInput,
  RegisterInput,
  RequestOtpInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from './auth.schema';

export interface SafeUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  providerProfile?: {
    id: string;
    verificationStatus: string;
    isVerified: boolean;
  } | null;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: Date;
  user: SafeUser;
}

export function toSafeUser(user: User & { providerProfile?: any }): SafeUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isPhoneVerified: user.isPhoneVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    providerProfile: user.providerProfile
      ? {
          id: user.providerProfile.id,
          verificationStatus: user.providerProfile.verificationStatus,
          isVerified: user.providerProfile.isVerified,
        }
      : null,
  };
}

function requestMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent']?.slice(0, 300),
    ip: (req.ip ?? '').slice(0, 100) || null,
  };
}

async function issueTokens(
  user: User,
  req: Request,
  previousTokenId?: string,
): Promise<TokenBundle> {
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken(user.id, tokenId);
  const accessToken = signAccessToken(user.id, user.role);
  const meta = requestMeta(req);

  // Refresh token TTL in ms derived from the signed token payload.
  const decoded = JSON.parse(
    Buffer.from(refreshToken.split('.')[1], 'base64url').toString('utf8'),
  ) as { exp: number };
  const refreshTokenExpiresAt = new Date(decoded.exp * 1000);

  if (previousTokenId) {
    try {
      await prisma.refreshToken.updateMany({
        where: { id: previousTokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {}
  }

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      tokenHash: sha256(refreshToken),
      userId: user.id,
      expiresAt: refreshTokenExpiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch {}

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: env.JWT_ACCESS_TTL,
    refreshTokenExpiresAt,
    user: toSafeUser(user),
  };
}

export async function register(input: RegisterInput, req: Request): Promise<TokenBundle> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw new ConflictError('An account with this phone number already exists');
  }
  if (input.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: input.email } });
    if (emailTaken) throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      phone: input.phone,
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      role: input.role as Role,
    },
  });

  await createOtp(user.phone, 'PHONE_VERIFICATION');
  return issueTokens(user, req);
}

export async function login(input: LoginInput, req: Request): Promise<TokenBundle> {
  const identifier = input.phone.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: identifier },
        { email: { equals: identifier, mode: 'insensitive' } },
      ],
    },
    include: { providerProfile: true },
  });
  if (!user?.passwordHash) {
    throw new UnauthorizedError('Invalid credentials');
  }
  if (!user.isActive) {
    throw new UnauthorizedError('This account has been deactivated');
  }
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }
  return issueTokens(user, req);
}

export async function refresh(rawToken: string, req: Request): Promise<TokenBundle> {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: { include: { providerProfile: true } } },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
    throw new UnauthorizedError('Refresh token is no longer valid');
  }
  if (!stored.user.isActive) {
    throw new UnauthorizedError('This account has been deactivated');
  }

  return issueTokens(stored.user, req, stored.id);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { providerProfile: true },
  });
  if (!user) throw new NotFoundError('User not found');
  return toSafeUser(user);
}

// ------------------------------------------------------------------
// OTP
// ------------------------------------------------------------------

export async function createOtp(phone: string, purpose: OtpPurpose): Promise<string | null> {
  const ttl = addMinutes(new Date(), env.OTP_TTL_MINUTES);

  const recent = await prisma.otpCode.findFirst({
    where: {
      phone,
      purpose,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    throw new TooManyRequestsError('An OTP was just sent. Please wait a minute before retrying.');
  }

  const code = generateNumericOtp(6);
  await prisma.otpCode.create({
    data: {
      phone,
      purpose,
      codeHash: sha256(code),
      expiresAt: ttl,
    },
  });

  await smsProvider.sendOtp(phone, code);
  logger.info('otp_created', { phone, purpose });

  return env.OTP_DEBUG_RETURN_CODE ? code : null;
}

export async function requestOtp(input: RequestOtpInput): Promise<string | null> {
  if (input.purpose === 'LOGIN' || input.purpose === 'PASSWORD_RESET') {
    const user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) throw new NotFoundError('No account found for this phone number');
  }
  return createOtp(input.phone, input.purpose);
}

export async function verifyOtp(input: VerifyOtpInput, req: Request): Promise<TokenBundle> {
  const record = await prisma.otpCode.findFirst({
    where: { phone: input.phone, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new BadRequestError('No active OTP found. Request a new code.');

  if (record.expiresAt < new Date()) {
    throw new BadRequestError('This OTP has expired. Request a new code.');
  }
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new TooManyRequestsError('Too many incorrect attempts. Request a new code.');
  }

  if (record.codeHash !== sha256(input.code)) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new BadRequestError('Incorrect OTP');
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) throw new NotFoundError('User not found');

  if (!user.isPhoneVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isPhoneVerified: true },
    });
    user.isPhoneVerified = true;
  }

  return issueTokens(user, req);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await prisma.otpCode.findFirst({
    where: { phone: input.phone, purpose: 'PASSWORD_RESET', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new BadRequestError('No active reset code found');
  if (record.expiresAt < new Date()) throw new BadRequestError('Reset code has expired');
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new TooManyRequestsError('Too many incorrect attempts');
  }
  if (record.codeHash !== sha256(input.code)) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new BadRequestError('Incorrect reset code');
  }

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) throw new NotFoundError('User not found');

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new BadRequestError('No password set on this account');
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function ensureAdminUser(): Promise<void> {
  try {
    const adminPhone = env.ADMIN_PHONE || '+919999999999';
    const adminEmail = env.ADMIN_EMAIL || 'admin@evrescue.local';
    const adminPass = env.ADMIN_PASSWORD || 'Admin@12345';

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: adminPhone },
          { email: adminEmail },
          { role: Role.ADMIN },
        ],
      },
    });

    const passwordHash = await bcrypt.hash(adminPass, 12);

    if (!existing) {
      await prisma.user.create({
        data: {
          phone: adminPhone,
          email: adminEmail,
          fullName: 'System Administrator',
          passwordHash,
          role: Role.ADMIN,
          isPhoneVerified: true,
          isActive: true,
        },
      });
      logger.info('admin_user_created', { phone: adminPhone, email: adminEmail });
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: Role.ADMIN,
          passwordHash,
          isActive: true,
          isPhoneVerified: true,
        },
      });
      logger.info('admin_user_verified', { phone: existing.phone });
    }
  } catch (err) {
    logger.error('ensure_admin_user_failed', { error: (err as Error).message });
  }
}
