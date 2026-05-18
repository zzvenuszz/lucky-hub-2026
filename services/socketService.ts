import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(userId: string, sessionId: string, userRole: string): Socket {
  if (socket?.connected) {
    socket.disconnect();
  }

  socket = io({
    path: '/socket.io',
    query: {
      userId,
      sessionId,
      userRole,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log(`[SocketService] Connected: userId=${userId}, socketId=${socket?.id}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[SocketService] Disconnected: reason=${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.error(`[SocketService] Connection error:`, err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[SocketService] Disconnected and cleaned up');
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function emitEvent(event: string, data: any, callback?: Function) {
  if (socket?.connected) {
    socket.emit(event, data, callback);
  } else {
    console.warn(`[SocketService] Cannot emit ${event}: socket not connected`);
  }
}