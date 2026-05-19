/**
 * WebSocket Service - Native WebSocket client (thay thế Socket.IO)
 * Sử dụng WebSocket API built-in của trình duyệt, không cần CDN
 */
import { WsEvent, WsMessage } from '../types.ts';

type EventHandler = (payload: any) => void;

class WsService {
  private ws: WebSocket | null = null;
  private userId: string = '';
  private sessionId: string = '';
  private userRole: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private isManuallyDisconnected = false;
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private pendingMessages: Array<{ event: WsEvent; payload: any }> = [];
  private isReady = false;

  /**
   * Kết nối WebSocket đến server
   */
  connect(userId: string, sessionId: string, userRole: string): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`[WsService] Already connected, disconnecting first`);
      this.disconnect();
    }

    this.userId = userId;
    this.sessionId = sessionId;
    this.userRole = userRole;
    this.isManuallyDisconnected = false;
    this.reconnectAttempts = 0;

    return this._createConnection();
  }

  /**
   * Ngắt kết nối WebSocket
   */
  disconnect() {
    this.isManuallyDisconnected = true;
    this._cleanup();
    console.log(`[WsService] Disconnected manually`);
  }

  /**
   * Gửi event qua WebSocket
   */
  send(event: WsEvent, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WsService] Cannot send ${event}: socket not open, queueing`);
      this.pendingMessages.push({ event, payload });
      return;
    }

    const message: WsMessage = {
      event,
      payload,
      timestamp: new Date().toISOString(),
      fromUserId: this.userId,
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`[WsService] 📤 ${event}:`, typeof payload === 'object' ? JSON.stringify(payload).substring(0, 100) : payload);
    } catch (err) {
      console.error(`[WsService] Error sending ${event}:`, err);
    }
  }

  /**
   * Đăng ký listener cho một event
   */
  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Hủy đăng ký listener
   */
  off(event: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Kiểm tra kết nối
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Lấy userId hiện tại
   */
  getUserId(): string {
    return this.userId;
  }

  // ===== Private methods =====

  private _createConnection(): boolean {
    // Xác định WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?userId=${encodeURIComponent(this.userId)}&sessionId=${encodeURIComponent(this.sessionId)}&role=${encodeURIComponent(this.userRole)}`;

    console.log(`[WsService] Connecting to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error(`[WsService] Failed to create WebSocket:`, err);
      return false;
    }

    this.ws.onopen = () => {
      console.log(`[WsService] ✅ Connected: userId=${this.userId}`);
      this.isReady = true;
      this.reconnectAttempts = 0;
      
      // Gửi pending messages
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift()!;
        this.send(msg.event, msg.payload);
      }

      // Bắt đầu heartbeat
      this._startHeartbeat();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this._handleMessage(data);
      } catch (err) {
        console.error(`[WsService] Failed to parse message:`, err);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`[WsService] Disconnected: code=${event.code}, reason=${event.reason}`);
      this.isReady = false;
      this._stopHeartbeat();

      if (!this.isManuallyDisconnected) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (err: Event) => {
      console.error(`[WsService] Error:`, err);
    };

    return true;
  }

  private _handleMessage(data: any) {
    const { event, payload } = data;
    
    if (!event) {
      console.warn(`[WsService] Received message without event:`, data);
      return;
    }

    // Handle heartbeat response
    if (event === 'pong') return;

    console.log(`[WsService] 📩 ${event}:`, typeof payload === 'object' ? JSON.stringify(payload).substring(0, 100) : payload);

    // Gọi tất cả handlers đã đăng ký cho event này
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[WsService] Error in handler for ${event}:`, err);
        }
      });
    }

    // Gọi handlers wildcard (*)
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[WsService] Error in wildcard handler:`, err);
        }
      });
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[WsService] Max reconnect attempts reached (${this.maxReconnectAttempts})`);
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    console.log(`[WsService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      if (!this.isManuallyDisconnected) {
        this._createConnection();
      }
    }, delay);
  }

  private _startHeartbeat() {
    this._stopHeartbeat();
    // Gửi ping mỗi 25s
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ event: 'ping', timestamp: new Date().toISOString() }));
        } catch {
          // ignore
        }
      }
    }, 25000);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _cleanup() {
    this._stopHeartbeat();
    
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Manual disconnect');
      }
      this.ws = null;
    }

    this.isReady = false;
    this.pendingMessages = [];
  }
}

// Singleton instance
const wsService = new WsService();

export default wsService;
