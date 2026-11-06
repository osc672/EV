import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in E.164 format');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  phone,
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().optional(),
  password,
  role: z.enum(['DRIVER', 'PROVIDER']).default('DRIVER'),
});

export const loginSchema = z.object({
  phone: z.string().trim().min(1, 'Phone or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const requestOtpSchema = z.object({
  phone,
  purpose: z.enum(['PHONE_VERIFICATION', 'LOGIN', 'PASSWORD_RESET']).default('PHONE_VERIFICATION'),
});

export const verifyOtpSchema = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/, 'Invalid OTP'),
  purpose: z.enum(['PHONE_VERIFICATION', 'LOGIN', 'PASSWORD_RESET']).default('PHONE_VERIFICATION'),
});

export const forgotPasswordSchema = z.object({
  phone,
});

export const resetPasswordSchema = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
