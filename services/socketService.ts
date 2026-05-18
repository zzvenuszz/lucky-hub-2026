// Socket.IO service - dùng global io từ CDN (script tag trong index.html)
// Không dùng import socket.io-client vì project dùng importmap không hỗ trợ

let socket: any = null;

export function connectSocket(userId: string, sessionId: string, userRole: string): any {
  // Kiểm tra io global từ CDN
  if (typeof (window as any).io === 'undefined') {
    console.warn('[SocketService] Socket.IO CDN not loaded, socket unavailable');
    return null;
  }

  if (socket?.connected) {
    socket.disconnect();
  }

  socket = (window as any).io({
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

  socket.on('disconnect', (reason: string) => {
    console.log(`[SocketService] Disconnected: reason=${reason}`);
  });

  socket.on('connect_error', (err: any) => {
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

export function getSocket(): any {
  return socket;
}

export function emitEvent(event: string, data: any, callback?: Function) {
  if (socket?.connected) {
    socket.emit(event, data, callback);
  } else {
    console.warn(`[SocketService] Cannot emit ${event}: socket not connected`);
  }
}