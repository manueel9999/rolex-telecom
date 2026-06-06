/**
 * Rolex Telecom — Backend Server
 * 
 * Express + WebSocket server that:
 * 1. Serves the frontend
 * 2. Manages device authentication (device codes)
 * 3. Relays commands from web UI → Windows agent (via WebSocket)
 * 4. Manages VDO.ninja room assignments
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

// ============================================
// DEVICE STORAGE (in-memory, replace with DB later)
// ============================================
const devices = new Map();
const sessions = new Map(); // sessionId → { deviceId, ws, connectedAt }
const agentConnections = new Map(); // deviceId → ws (Windows agent)

// --- Seed some test devices ---
function seedDevices() {
  devices.set('57NvLjFgq4', {
    id: '57NvLjFgq4',
    name: 'Устройство №1',
    phone: '+7 (XXX) XXX-XX-XX',
    vdoRoom: 'rolex-device-1',
    vdoPush: '', // VDO.ninja push URL for the phone side
    vdoView: '', // VDO.ninja view URL for the web side
    status: 'offline', // online/offline/busy
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

// --- Admin: Add Device ---
app.post('/api/admin/devices', (req, res) => {
  const { name, phone, vdoRoom } = req.body;
  const id = generateDeviceCode();

  const device = {
    id,
    name: name || `Устройство ${devices.size + 1}`,
    phone: phone || '',
    vdoRoom: vdoRoom || `rolex-${id.toLowerCase()}`,
    vdoPush: '',
    vdoView: '',
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
  
  const { name, phone, vdoRoom, vdoPush, vdoView } = req.body;
  if (name !== undefined) device.name = name;
  if (phone !== undefined) device.phone = phone;
  if (vdoRoom !== undefined) device.vdoRoom = vdoRoom;
  if (vdoPush !== undefined) device.vdoPush = vdoPush;
  if (vdoView !== undefined) device.vdoView = vdoView;
  
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

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ============================================
// WEBSOCKET
// ============================================
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type'); // 'user' or 'agent'
  const id = url.searchParams.get('id');     // sessionId or deviceId

  console.log(`[WS] New connection: type=${type}, id=${id}`);

  if (type === 'agent') {
    // Windows agent connecting for a device
    handleAgentConnection(ws, id);
  } else {
    // Web user connecting with sessionId
    handleUserConnection(ws, id);
  }
});

function handleUserConnection(ws, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid session' }));
    ws.close();
    return;
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
      // User pressed a dialpad key
      console.log(`[CMD] Dial key: ${msg.key} → device ${deviceId}`);
      relayToAgent(agentWs, {
        type: 'dial',
        key: msg.key,
      });
      break;

    case 'call':
      // User pressed call button
      console.log(`[CMD] Call: ${msg.number} → device ${deviceId}`);
      relayToAgent(agentWs, {
        type: 'call',
        number: msg.number,
      });
      // Save to history
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
  // Agent sends status updates back to web users
  switch (msg.type) {
    case 'call_status':
      // e.g. ringing, connected, ended
      broadcastToDeviceUsers(deviceId, {
        type: 'call_status',
        status: msg.status,
        number: msg.number,
        duration: msg.duration,
      });
      break;

    case 'incoming_call':
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
      // Forward any other messages to users
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
  console.log(`\n--- Ready ---\n`);
});
