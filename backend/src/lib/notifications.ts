import { Prisma } from '../generated/prisma';
import { prisma } from './prisma';
import { logger } from './logger';
import { emitToUser } from './socket';

export interface NotifyInput {
  userId: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  channel?: 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';
}

/**
 * Persist an in-app notification. Push delivery is handled by the
 * notifications module when Firebase credentials are configured.
 */
export async function notify(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      data: input.data,
      channel: input.channel ?? 'IN_APP',
    },
  });
  logger.info('notification_created', {
    userId: input.userId,
    title: input.title,
    channel: input.channel ?? 'IN_APP',
  });

  try {
    emitToUser(input.userId, 'notification:received', {
      id: notification.id,
      title: input.title,
      body: input.body,
      data: input.data,
      createdAt: notification.createdAt.toISOString(),
    });
  } catch (err) {
    logger.warn('notification_socket_emit_failed', { error: (err as Error).message });
  }

  return notification;
}

export async function notifyMany(inputs: NotifyInput[]) {
  if (!inputs.length) return;
  await prisma.notification.createMany({
    data: inputs.map((i) => ({
      userId: i.userId,
      title: i.title,
      body: i.body,
      data: i.data,
      channel: i.channel ?? 'IN_APP',
    })),
  });

  for (const input of inputs) {
    try {
      emitToUser(input.userId, 'notification:received', {
        title: input.title,
        body: input.body,
        data: input.data,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }
}
