import { Router } from 'express';
import crypto from 'node:crypto';
import axios from 'axios';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

const router = Router();

const orderSchema = z.object({ bookingId: z.string().uuid() });
const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/**
 * @openapi
 * /payments/razorpay/order:
 *   post:
 *     tags: [Payments]
 *     summary: Create a Razorpay order for a booking
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/razorpay/order',
  authenticate,
  validate(orderSchema),
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.body.bookingId },
      include: { payment: true },
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.driverId !== req.user!.id) throw new ForbiddenError('Not your booking');
    if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') {
      throw new BadRequestError('Cancelled bookings cannot be paid');
    }
    if (booking.paymentStatus === 'PAID') {
      throw new BadRequestError('This booking is already paid');
    }

    const payable = booking.totalAmount ?? booking.estimatedCost ?? 150;
    const amountPaise = Math.max(100, Math.round(Number(payable) * 100));

    // If Razorpay live/test keys are present in .env, call real Razorpay API
    if (razorpayConfigured()) {
      const auth = Buffer.from(
        `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
      ).toString('base64');

      const { data } = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: amountPaise,
          currency: 'INR',
          receipt: booking.code,
          notes: { bookingId: booking.id },
        },
        { headers: { Authorization: `Basic ${auth}` } },
      );

      await prisma.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          amount: Number(payable),
          method: 'RAZORPAY',
          status: 'PENDING',
          gateway: 'razorpay',
          gatewayOrderId: data.id,
        },
        update: {
          method: 'RAZORPAY',
          status: 'PENDING',
          gateway: 'razorpay',
          gatewayOrderId: data.id,
        },
      });

      return ok(res, {
        orderId: data.id,
        amount: data.amount,
        currency: data.currency,
        keyId: env.RAZORPAY_KEY_ID,
      });
    }

    // Fallback: Test simulation mode for development (works out-of-the-box)
    const testOrderId = `order_test_${Date.now()}`;
    await prisma.payment.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        amount: Number(payable),
        method: 'RAZORPAY',
        status: 'PENDING',
        gateway: 'razorpay',
        gatewayOrderId: testOrderId,
      },
      update: {
        method: 'RAZORPAY',
        status: 'PENDING',
        gateway: 'razorpay',
        gatewayOrderId: testOrderId,
      },
    });

    return ok(res, {
      orderId: testOrderId,
      amount: amountPaise,
      currency: 'INR',
      keyId: 'rzp_test_dev',
    });
  }),
);

/**
 * @openapi
 * /payments/razorpay/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Verify a Razorpay payment signature
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/razorpay/verify',
  authenticate,
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify HMAC signature if live keys are present
    if (razorpayConfigured() && !razorpay_order_id.startsWith('order_test_')) {
      const expected = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expected !== razorpay_signature) {
        throw new BadRequestError('Invalid payment signature');
      }
    }

    const payment = await prisma.payment.findUnique({
      where: { gatewayOrderId: razorpay_order_id },
      include: { booking: true },
    });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.booking.driverId !== req.user!.id) throw new ForbiddenError('Not your payment');

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          gatewayPaymentId: razorpay_payment_id,
          gatewaySignature: razorpay_signature,
        },
      }),
      prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: 'RAZORPAY',
          status: payment.booking.status === 'PENDING' ? 'CONFIRMED' : payment.booking.status,
        },
      }),
    ]);

    return ok(res, { status: 'PAID' });
  }),
);

/**
 * Razorpay webhook. Mounted with a raw body parser in app.ts.
 */
router.post(
  '/razorpay/webhook',
  asyncHandler(async (req, res) => {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      logger.warn('razorpay_webhook_no_secret');
      return ok(res, { received: true });
    }
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!signature || !rawBody) throw new BadRequestError('Missing webhook signature');

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    if (expected !== signature) throw new BadRequestError('Invalid webhook signature');

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
    };

    if (event.event === 'payment.captured') {
      const entity = event.payload?.payment?.entity;
      if (entity?.order_id) {
        const payment = await prisma.payment.findUnique({
          where: { gatewayOrderId: entity.order_id },
        });
        if (payment) {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data: { status: 'PAID', gatewayPaymentId: entity.id },
            }),
            prisma.booking.update({
              where: { id: payment.bookingId },
              data: { paymentStatus: 'PAID', paymentMethod: 'RAZORPAY' },
            }),
          ]);
        }
      }
    }

    return ok(res, { received: true });
  }),
);

export default router;
