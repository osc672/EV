import { Router } from 'express';
import { z } from 'zod';
import { Role } from '../../generated/prisma';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { param } from '../../lib/params';
import { ok } from '../../lib/response';
import { prisma } from '../../lib/prisma';
import { notify, notifyMany } from '../../lib/notifications';
import { env } from '../../config/env';

const router = Router();

const supportSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(2000),
});

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok(res, notifications);
  }),
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    return ok(res, { count });
  }),
);

router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: param(req, 'id'), userId: req.user!.id },
      data: { readAt: new Date() },
    });
    return ok(res, { message: 'Marked read' });
  }),
);

router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { message: 'All notifications marked read' });
  }),
);

/**
 * Submit a Helpdesk / Support ticket directly to Admin
 */
router.post(
  '/support',
  authenticate,
  validate(supportSchema),
  asyncHandler(async (req, res) => {
    const { subject, message } = req.body as { subject: string; message: string };
    
    // Fetch full sender user details
    const sender = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, fullName: true, phone: true, email: true },
    });

    const senderName = sender?.fullName || 'User';
    const senderPhone = sender?.phone || '';
    const senderEmail = sender?.email || '';

    // Find all admin accounts to deliver ticket notification
    const admins = await prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true, email: true },
    });

    if (admins.length > 0) {
      await notifyMany(
        admins.map((admin) => ({
          userId: admin.id,
          title: `Helpdesk Ticket: ${subject}`,
          body: `From: ${senderName} (${senderPhone || senderEmail || 'Provider'})\n${message}`,
          data: {
            type: 'SUPPORT_TICKET',
            senderId: req.user!.id,
            senderName,
            senderPhone,
            senderEmail,
            subject,
            message,
          },
        })),
      );
    }

    // Persist in AuditLog so Admin console Audit tab lists the ticket
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'SUPPORT_TICKET_SUBMITTED',
        entity: 'Helpdesk',
        metadata: {
          subject,
          message,
          senderName,
          phone: senderPhone,
          email: senderEmail,
        },
      },
    });

    // Provide confirmation notification back to sender
    await notify({
      userId: req.user!.id,
      title: 'Support Ticket Submitted',
      body: `Your ticket "${subject}" has been delivered to Admin (${env.ADMIN_EMAIL}). The admin team will review it.`,
      data: { type: 'SUPPORT_TICKET_CONFIRMATION', subject },
    });

    return ok(res, {
      message: 'Support ticket sent to Administrator successfully',
      adminEmail: env.ADMIN_EMAIL,
    });
  }),
);

export default router;
