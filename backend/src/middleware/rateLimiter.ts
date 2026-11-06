import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const skip = () => isTest;

/** Broad protection for all API traffic — raised to 2,000 req/min so multiple concurrent users sharing Wi-Fi/IP never throttle. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 2000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' } },
});

/** Tighter limit for auth + OTP endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many auth attempts, try later' },
  },
});

/** OTP request throttle per IP. */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'OTP requested too frequently' },
  },
});
