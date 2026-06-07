/**
 * WebSocket Service — real-time connection to backend
 * Handles: command relay, status updates, reconnection
 */

export class WsService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.sessionId = null;
    this.isConnected = false;
    this.pingInterval = null;
    this.lastStates = new Map();
  }

  connect(sessionId) {
    this.sessionId = sessionId;
    this.reconnectAttempts = 0;
    this.lastStates.clear();
    this._connect();
  }

  _connect() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch (e) {}
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?type=user&id=${this.sessionId}`;

    console.log('[WS] Connecting to:', url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection', { connected: true });

      // Start application-level ping
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping' });
        }
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[WS] Message:', msg);
        if (msg.type) {
          this.lastStates.set(msg.type, msg);
        }
        this.emit(msg.type, msg);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      console.log('[WS] Disconnected');
      this.isConnected = false;
      this.emit('connection', { connected: false });
      this._scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      this.emit('reconnect_failed', {});
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this._connect();
    }, delay);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Not connected, cannot send:', msg);
    }
  }

  // --- Commands ---
  dialKey(key) {
    this.send({ type: 'dial', key });
  }

  makeCall(number) {
    this.send({ type: 'call', number });
  }

  hangup() {
    this.send({ type: 'hangup' });
  }

  answer() {
    this.send({ type: 'answer' });
  }

  mute(enabled) {
    this.send({ type: 'mute', enabled });
  }

  hold(enabled) {
    this.send({ type: 'hold', enabled });
  }

  dtmf(key) {
    this.send({ type: 'dtmf', key });
  }

  speaker(enabled) {
    this.send({ type: 'speaker', enabled });
  }

  // --- Event system ---
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(cb => {
        try { cb(data); } catch (e) { console.error('[WS] Listener error:', e); }
      });
    }
  }

  getLastState(type) {
    return this.lastStates.get(type);
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.maxReconnectAttempts = 0; // prevent reconnect
    if (this.ws) {
      this.ws.close();
    }
  }
}

export const ws = new WsService();
