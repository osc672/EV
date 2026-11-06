import { Router } from 'express';
import * as controller from './auth.controller';
import { validate } from '../../middleware/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from './auth.schema';
import { authenticate } from '../../middleware/auth';
import { authLimiter, otpLimiter } from '../../middleware/rateLimiter';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a driver or provider account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201: { description: Account created and tokens issued }
 *       409: { description: Phone or email already registered }
 */
router.post('/register', authLimiter, validate(registerSchema), controller.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with phone and password
 *     responses:
 *       200: { description: Authenticated }
 *       401: { description: Invalid credentials }
 */
router.post('/login', authLimiter, validate(loginSchema), controller.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and issue a new access token
 *     responses:
 *       200: { description: New token bundle }
 */
router.post('/refresh', validate(refreshSchema), controller.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token
 */
router.post('/logout', controller.logout);

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke all refresh tokens for the current user
 *     security: [{ bearerAuth: [] }]
 */
router.post('/logout-all', authenticate, controller.logoutAll);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', authenticate, controller.me);

/**
 * @openapi
 * /auth/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a phone verification / login / reset OTP
 */
router.post('/otp/request', otpLimiter, validate(requestOtpSchema), controller.requestOtp);

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify an OTP and issue tokens
 */
router.post('/otp/verify', authLimiter, validate(verifyOtpSchema), controller.verifyOtp);

router.post('/password/forgot', otpLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/password/reset', authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post(
  '/password/change',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword,
);

export default router;
