/**
 * Rolex Telecom — Backend Server
 * 
 * Express + WebSocket server that:
 * 1. Serves the frontend
 * 2. Manages device authentication (device codes)
 * 3. Relays commands from web UI → Windows agent (via WebSocket)
 * 4. Manages VDO.ninja room assignments per device
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve frontend static files (after build)
app.use(express.static(path.join(__dirname, '../dist')));
// Serve public/ directory (bridge.html, etc.)
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// DEVICE STORAGE (in-memory, replace with DB later)
// ============================================
const devices = new Map();
const sessions = new Map(); // sessionId → { deviceId, ws, connectedAt }
const agentConnections = new Map(); // deviceId → ws (Windows agent)

/**
 * Generate a unique VDO.ninja password for a device
 */
function generateVdoPassword() {
  return crypto.randomBytes(6).toString('base64url'); // e.g. "aB3xQ9kL"
}

/**
 * Generate a unique VDO.ninja room name for a device
 * Format: rolex_{deviceId_lowercase} — unique, deterministic
 */
function generateVdoRoom(deviceId) {
  return `rolex${deviceId.toLowerCase()}`;
}

// --- Seed some test devices ---
function seedDevices() {
  const id = '57NvLjFgq4';
  devices.set(id, {
    id,
    name: 'Устройство №1',
    phone: '+7 (XXX) XXX-XX-XX',
    vdoRoom: generateVdoRoom(id),
    vdoPassword: generateVdoPassword(),
    scrcpyUrl: '', // set by agent when ws-scrcpy is running
    status: 'offline',
    createdAt: new Date().toISOString(),
  });
}
seedDevices();

// ============================================
// REST API
// ============================================

// --- Device Login ---
app.post('/api/auth/login', (req, res) => {
  const { deviceCode } = req.body;

  if (!deviceCode) {
    return res.status(400).json({ error: 'Введите код устройства' });
  }

  const device = devices.get(deviceCode);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, {
    deviceId: device.id,
    connectedAt: new Date().toISOString(),
    ws: null,
  });

  res.json({
    success: true,
    sessionId,
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
      vdoRoom: device.vdoRoom,
      vdoPassword: device.vdoPassword,
      scrcpyUrl: device.scrcpyUrl,
    },
  });
});

// --- Verify Session ---
app.get('/api/auth/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Сессия не найдена' });
  }

  const device = devices.get(session.deviceId);
  res.json({
    success: true,
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
      vdoRoom: device.vdoRoom,
      vdoPassword: device.vdoPassword,
      scrcpyUrl: device.scrcpyUrl,
    },
  });
});

// --- Logout ---
app.post('/api/auth/logout', (req, res) => {
  const { sessionId } = req.body;
  sessions.delete(sessionId);
  res.json({ success: true });
});

// --- Get Device Info ---
app.get('/api/device/:deviceId', (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }
  res.json({ success: true, device });
});

// --- Bridge: Get VDO.ninja room info for a device ---
app.get('/api/bridge/:deviceId', (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }
  res.json({
    success: true,
    deviceName: device.name,
    vdoRoom: device.vdoRoom,
    vdoPassword: device.vdoPassword,
  });
});

// --- Agent: Set scrcpy URL for a device ---
app.post('/api/device/:deviceId/scrcpy', (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }
  const { scrcpyUrl } = req.body;
  device.scrcpyUrl = scrcpyUrl || '';
  devices.set(device.id, device);

  // Notify connected operators
  broadcastToDeviceUsers(device.id, {
    type: 'scrcpy_url',
    scrcpyUrl: device.scrcpyUrl,
  });

  console.log(`[SCRCPY] Device ${device.id} scrcpy URL set to: ${device.scrcpyUrl}`);
  res.json({ success: true, scrcpyUrl: device.scrcpyUrl });
});

// --- Admin: Add Device ---
app.post('/api/admin/devices', (req, res) => {
  const { name, phone } = req.body;
  const id = generateDeviceCode();

  const device = {
    id,
    name: name || `Устройство ${devices.size + 1}`,
    phone: phone || '',
    vdoRoom: generateVdoRoom(id),
    vdoPassword: generateVdoPassword(),
    scrcpyUrl: '',
    status: 'offline',
    createdAt: new Date().toISOString(),
  };

  devices.set(id, device);
  res.json({ success: true, device });
});

// --- Admin: List Devices ---
app.get('/api/admin/devices', (req, res) => {
  const list = Array.from(devices.values());
  res.json({ success: true, devices: list });
});

// --- Admin: Delete Device ---
app.delete('/api/admin/devices/:deviceId', (req, res) => {
  devices.delete(req.params.deviceId);
  res.json({ success: true });
});

// --- Admin: Update Device ---
app.put('/api/admin/devices/:deviceId', (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }
  
  const { name, phone } = req.body;
  if (name !== undefined) device.name = name;
  if (phone !== undefined) device.phone = phone;
  
  devices.set(device.id, device);
  
  res.json({ success: true, device });
});

// --- Admin: Regenerate VDO password for a device ---
app.post('/api/admin/devices/:deviceId/regen-vdo', (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Устройство не найдено' });
  }
  device.vdoPassword = generateVdoPassword();
  devices.set(device.id, device);
  res.json({ success: true, device });
});

// --- Call History (in-memory) ---
const callHistory = [];

app.get('/api/calls/:deviceId', (req, res) => {
  const deviceCalls = callHistory
    .filter(c => c.deviceId === req.params.deviceId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json({ success: true, calls: deviceCalls });
});

// SPA fallback — skip bridge.html and other static files
app.get('/{*splat}', (req, res) => {
  if (req.path.endsWith('.html') && req.path !== '/index.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ============================================
// WEBSOCKET — only user and agent, no more bridge
// ============================================
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type'); // 'user' or 'agent'
  const id = url.searchParams.get('id');     // sessionId or deviceId

  console.log(`[WS] New connection: type=${type}, id=${id}`);

  // Keepalive ping check: allow up to 2 missed check-ins
  ws.isAlive = 2;
  ws.on('pong', () => { ws.isAlive = 2; });

  if (type === 'agent') {
    handleAgentConnection(ws, id);
  } else {
    handleUserConnection(ws, id);
  }
});

// Ping all clients every 25s to keep connections alive through nginx
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive <= 0) {
      console.log('[WS] Heartbeat timeout. Terminating connection.');
      return ws.terminate();
    }
    ws.isAlive--;
    try {
      ws.ping();
    } catch (e) {
      console.error('[WS] Ping error:', e);
    }
  });
}, 25000);

function handleUserConnection(ws, sessionId) {
  let session = sessions.get(sessionId);

  // Auto-recover session after server restart
  if (!session) {
    const device = devices.get(sessionId);
    if (device) {
      const newSessionId = sessionId;
      session = { deviceId: sessionId, ws, connectedAt: new Date() };
      sessions.set(newSessionId, session);
      console.log(`[WS] Auto-created session for device: ${sessionId}`);
    } else {
      let deviceId = null;
      for (const [id] of devices) { deviceId = id; break; }
      if (deviceId) {
        session = { deviceId, ws, connectedAt: new Date() };
        sessions.set(sessionId, session);
        console.log(`[WS] Recovered session ${sessionId} → device ${deviceId}`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid session' }));
        ws.close();
        return;
      }
    }
  }

  session.ws = ws;
  const device = devices.get(session.deviceId);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'connected',
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
      vdoRoom: device.vdoRoom,
      vdoPassword: device.vdoPassword,
      scrcpyUrl: device.scrcpyUrl,
    },
  }));

  // Check if agent is online
  const agentWs = agentConnections.get(session.deviceId);
  ws.send(JSON.stringify({
    type: 'agent_status',
    online: agentWs && agentWs.readyState === WebSocket.OPEN,
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      ws.isAlive = 2;
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      handleUserMessage(ws, session, msg);
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] User disconnected: session=${sessionId}`);
    if (session) session.ws = null;
  });
}

function handleAgentConnection(ws, deviceId) {
  const device = devices.get(deviceId);
  if (!device) {
    ws.send(JSON.stringify({ type: 'error', message: 'Unknown device' }));
    ws.close();
    return;
  }

  agentConnections.set(deviceId, ws);
  device.status = 'online';

  console.log(`[WS] Agent connected for device: ${deviceId}`);

  // Notify all users connected to this device
  broadcastToDeviceUsers(deviceId, {
    type: 'agent_status',
    online: true,
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      ws.isAlive = 2;
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      handleAgentMessage(ws, deviceId, msg);
    } catch (e) {
      console.error('[WS] Agent parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Agent disconnected: device=${deviceId}`);
    agentConnections.delete(deviceId);
    device.status = 'offline';

    broadcastToDeviceUsers(deviceId, {
      type: 'agent_status',
      online: false,
    });
  });
}

function handleUserMessage(ws, session, msg) {
  const deviceId = session.deviceId;
  const agentWs = agentConnections.get(deviceId);

  switch (msg.type) {
    case 'dial':
      console.log(`[CMD] Dial key: ${msg.key} → device ${deviceId}`);
      relayToAgent(agentWs, { type: 'dial', key: msg.key });
      break;

    case 'call':
      console.log(`[CMD] Call: ${msg.number} → device ${deviceId}`);
      relayToAgent(agentWs, { type: 'call', number: msg.number });
      callHistory.push({
        id: uuidv4(),
        deviceId,
        number: msg.number,
        direction: 'outgoing',
        timestamp: new Date().toISOString(),
        duration: 0,
        status: 'initiated',
      });
      break;

    case 'hangup':
      console.log(`[CMD] Hangup → device ${deviceId}`);
      relayToAgent(agentWs, { type: 'hangup' });
      break;

    case 'answer':
      console.log(`[CMD] Answer → device ${deviceId}`);
      relayToAgent(agentWs, { type: 'answer' });
      break;

    case 'mute':
      relayToAgent(agentWs, { type: 'mute', enabled: msg.enabled });
      break;

    case 'hold':
      relayToAgent(agentWs, { type: 'hold', enabled: msg.enabled });
      break;

    case 'dtmf':
      relayToAgent(agentWs, { type: 'dtmf', key: msg.key });
      break;

    case 'speaker':
      relayToAgent(agentWs, { type: 'speaker', enabled: msg.enabled });
      break;

    default:
      console.log(`[WS] Unknown user message type: ${msg.type}`);
  }
}

function handleAgentMessage(ws, deviceId, msg) {
  switch (msg.type) {
    case 'call_status':
      broadcastToDeviceUsers(deviceId, {
        type: 'call_status',
        status: msg.status,
        number: msg.number,
        duration: msg.duration,
      });

      if (msg.status === 'ended' && msg.number) {
        const existing = callHistory.find(c => 
          c.deviceId === deviceId && 
          c.number === msg.number && 
          c.status !== 'ended'
        );
        if (existing) {
          existing.duration = msg.duration || 0;
          existing.status = 'ended';
        }
      } else if (msg.status === 'connected' && msg.number) {
        const existing = callHistory.find(c => 
          c.deviceId === deviceId && 
          c.number === msg.number && 
          c.status !== 'ended'
        );
        if (existing) {
          existing.status = 'connected';
        }
      }
      break;

    case 'incoming_call':
      callHistory.push({
        id: uuidv4(),
        deviceId,
        number: msg.number || 'Неизвестный',
        direction: 'incoming',
        timestamp: new Date().toISOString(),
        duration: 0,
        status: 'ringing',
      });

      broadcastToDeviceUsers(deviceId, {
        type: 'incoming_call',
        number: msg.number,
        contactName: msg.contactName,
      });
      break;

    case 'phone_status':
      const device = devices.get(deviceId);
      if (device) {
        device.status = msg.status;
      }
      broadcastToDeviceUsers(deviceId, {
        type: 'phone_status',
        status: msg.status,
        battery: msg.battery,
        signal: msg.signal,
      });
      break;

    default:
      broadcastToDeviceUsers(deviceId, msg);
  }
}

function relayToAgent(agentWs, msg) {
  if (agentWs && agentWs.readyState === WebSocket.OPEN) {
    agentWs.send(JSON.stringify(msg));
  }
}

function broadcastToDeviceUsers(deviceId, msg) {
  const data = JSON.stringify(msg);
  for (const [, session] of sessions) {
    if (session.deviceId === deviceId && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  }
}

function generateDeviceCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log(`\n🚀 Rolex Telecom Server running on http://localhost:${PORT}`);
  console.log(`📱 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`\n📋 Test device: 57NvLjFgq4`);
  const testDevice = devices.get('57NvLjFgq4');
  if (testDevice) {
    console.log(`🔊 VDO Room: ${testDevice.vdoRoom}`);
    console.log(`🔑 VDO Password: ${testDevice.vdoPassword}`);
  }
  console.log(`\n--- Ready ---\n`);
});
