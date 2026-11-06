import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { Role } from '../generated/prisma';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      role: Role;
    };
  };
}

let io: Server | null = null;

export interface CachedDriverLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  driverId?: string;
  timestamp: string;
}

export const latestDriverLocations = new Map<string, CachedDriverLocation>();

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers.authorization;
      if (!authHeader) {
        // Allow unauthenticated connection for public station map availability
        return next();
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const payload = verifyAccessToken(token);
      socket.data.user = {
        id: payload.sub,
        role: payload.role,
      };
      return next();
    } catch (err) {
      logger.warn('socket_auth_failed', { error: (err as Error).message });
      // Still allow connection as guest or drop
      return next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.data.user;
    if (user) {
      const userRoom = `user:${user.id}`;
      void socket.join(userRoom);
      logger.info('socket_client_connected', { socketId: socket.id, userId: user.id, role: user.role });
    } else {
      logger.info('socket_client_connected_guest', { socketId: socket.id });
    }

    // Dynamic authentication or joining user notification room
    socket.on('auth:authenticate', ({ token, userId }: { token?: string; userId?: string }) => {
      let resolvedUserId = userId;
      if (token) {
        try {
          const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
          const payload = verifyAccessToken(cleanToken);
          socket.data.user = {
            id: payload.sub,
            role: payload.role,
          };
          resolvedUserId = payload.sub;
        } catch (err) {
          logger.warn('dynamic_socket_auth_failed', { error: (err as Error).message });
        }
      }
      if (resolvedUserId) {
        const userRoom = `user:${resolvedUserId}`;
        void socket.join(userRoom);
        logger.info('socket_client_joined_user_room', { socketId: socket.id, userId: resolvedUserId });
      }
    });

    socket.on('join:user', ({ userId }: { userId: string }) => {
      if (!userId) return;
      const userRoom = `user:${userId}`;
      void socket.join(userRoom);
      logger.info('socket_client_joined_user_room_direct', { socketId: socket.id, userId });
    });

    socket.on('join:provider', ({ providerId }: { providerId: string }) => {
      if (!providerId) return;
      const providerRoom = `provider:${providerId}`;
      void socket.join(providerRoom);
      logger.info('socket_client_joined_provider_room_direct', { socketId: socket.id, providerId });
    });

    // Join a booking room for real-time dispatch, GPS tracking & chat
    socket.on('join:booking', ({ bookingId }: { bookingId: string }) => {
      if (!bookingId) return;
      const room = `booking:${bookingId}`;
      void socket.join(room);
      logger.info('socket_joined_booking', { socketId: socket.id, bookingId });

      // Immediately deliver cached driver location if available
      const cached = latestDriverLocations.get(bookingId);
      if (cached) {
        socket.emit('driver:location:update', cached);
      }
    });

    socket.on('leave:booking', ({ bookingId }: { bookingId: string }) => {
      if (!bookingId) return;
      const room = `booking:${bookingId}`;
      void socket.leave(room);
    });

    // Real-time Driver GPS streaming to Host
    socket.on(
      'driver:location',
      (payload: {
        bookingId: string;
        latitude: number;
        longitude: number;
        speed?: number;
        heading?: number;
      }) => {
        if (!payload.bookingId) return;
        const locData: CachedDriverLocation = {
          ...payload,
          driverId: user?.id,
          timestamp: new Date().toISOString(),
        };
        latestDriverLocations.set(payload.bookingId, locData);
        io?.to(`booking:${payload.bookingId}`).emit('driver:location:update', locData);
      },
    );

    // Real-time in-app chat between Driver and Host
    socket.on(
      'chat:send',
      (payload: { bookingId: string; message: string; id?: string }) => {
        if (!payload.bookingId || !payload.message) return;
        const chatItem = {
          id: payload.id || `msg_${Date.now()}`,
          bookingId: payload.bookingId,
          senderId: user?.id || 'unknown',
          message: payload.message,
          timestamp: new Date().toISOString(),
        };
        io?.to(`booking:${payload.bookingId}`).emit('chat:received', chatItem);
      },
    );

    socket.on('disconnect', (reason) => {
      logger.info('socket_client_disconnected', { socketId: socket.id, reason });
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io server has not been initialized');
  }
  return io;
}

/**
 * Emit event to a specific user (their private channel)
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit event to a specific provider profile channel
 */
export function emitToProvider(providerId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`provider:${providerId}`).emit(event, payload);
}

/**
 * Emit event to everyone in a specific booking room (Driver & Host)
 */
export function emitToBooking(bookingId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`booking:${bookingId}`).emit(event, payload);
}

/**
 * Broadcast station availability change to all active drivers
 */
export function broadcastStationStatus(stationId: string, isAvailable: boolean, powerKw?: number): void {
  if (!io) return;
  io.emit('station:status_changed', {
    stationId,
    isAvailable,
    powerKw,
    updatedAt: new Date().toISOString(),
  });
}
