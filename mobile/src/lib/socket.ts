import { io, Socket } from 'socket.io-client';
import { getApiUrl } from './config';

let socket: Socket | null = null;
let activeSocketToken: string | null = null;
let activeUserId: string | null = null;
let activeProviderId: string | null = null;

export function getSocketServerUrl(): string {
  const api = getApiUrl();
  return api.replace(/\/api\/v1\/?$/, '');
}

/**
 * Returns the active Socket.io instance, connecting if needed.
 */
export function getSocket(): Socket {
  if (socket && socket.connected) {
    return socket;
  }

  const serverUrl = getSocketServerUrl();
  const token = activeSocketToken;

  if (!socket) {
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: {
        token: token ? `Bearer ${token}` : undefined,
      },
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to server, id:', socket?.id);
      if (activeSocketToken) {
        socket?.emit('auth:authenticate', { token: `Bearer ${activeSocketToken}`, userId: activeUserId });
      }
      if (activeUserId) {
        socket?.emit('join:user', { userId: activeUserId });
      }
      if (activeProviderId) {
        socket?.emit('join:provider', { providerId: activeProviderId });
      }
    });

    socket.on('connect_error', (err) => {
      console.log('[Socket] Connection error:', err.message);
    });
  } else if (!socket.connected) {
    if (token) {
      socket.auth = { token: `Bearer ${token}` };
    }
    socket.connect();
  }

  return socket;
}

/**
 * Update auth credentials for socket when user logs in.
 */
export function authenticateSocket(token: string, userId?: string, providerId?: string): void {
  activeSocketToken = token;
  if (userId) activeUserId = userId;
  if (providerId) activeProviderId = providerId;
  if (socket) {
    socket.auth = { token: `Bearer ${token}` };
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit('auth:authenticate', { token: `Bearer ${token}`, userId: activeUserId });
      if (activeUserId) {
        socket.emit('join:user', { userId: activeUserId });
      }
      if (activeProviderId) {
        socket.emit('join:provider', { providerId: activeProviderId });
      }
    }
  } else {
    getSocket();
  }
}

/**
 * Join user-specific notification channel
 */
export function joinUserRoom(userId: string): void {
  activeUserId = userId;
  const s = socket || getSocket();
  if (s.connected) {
    s.emit('join:user', { userId });
  } else {
    s.once('connect', () => {
      s.emit('join:user', { userId });
    });
  }
}

/**
 * Join provider station notification channel
 */
export function joinProviderRoom(providerId: string): void {
  activeProviderId = providerId;
  const s = socket || getSocket();
  if (s.connected) {
    s.emit('join:provider', { providerId });
  } else {
    s.once('connect', () => {
      s.emit('join:provider', { providerId });
    });
  }
}

/**
 * Disconnect socket when signing out.
 */
export function disconnectSocket(): void {
  activeSocketToken = null;
  activeUserId = null;
  activeProviderId = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join a real-time booking room (for live status updates, live GPS tracking, and chat)
 */
export function joinBookingRoom(bookingId: string): void {
  const s = getSocket();
  s.emit('join:booking', { bookingId });
}

/**
 * Leave a real-time booking room
 */
export function leaveBookingRoom(bookingId: string): void {
  if (!socket) return;
  socket.emit('leave:booking', { bookingId });
}

/**
 * Stream driver's live GPS coordinates to the host
 */
export function emitDriverLocation(
  bookingId: string,
  coords: { latitude: number; longitude: number; speed?: number; heading?: number },
): void {
  const s = getSocket();
  s.emit('driver:location', {
    bookingId,
    ...coords,
  });
}

/**
 * Send real-time chat message to the booking room
 */
export function emitChatMessage(bookingId: string, message: string): void {
  const s = getSocket();
  s.emit('chat:send', {
    bookingId,
    message,
  });
}
