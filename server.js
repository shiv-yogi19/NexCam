/**
 * NEXCAM CCTV - Local Development & Signaling Server
 * Zero-Dependency Pure Node.js Server (HTTP + RFC 6455 WebSockets)
 * Created By Shiv Yogi
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm'
};

// WebSocket Peers Registry
const peers = new Map(); // peerId -> { socket, role, deviceId, meta }

// Create HTTP Server
const server = http.createServer((req, res) => {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      app: 'NEXCAM CCTV',
      creator: 'Created By Shiv Yogi',
      activePeers: peers.size
    }));
    return;
  }

  // Static File Serving
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found - NEXCAM CCTV (Created By Shiv Yogi)');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// RFC 6455 WebSocket Upgrade & Frame Parser (Zero External Dependencies)
server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  const peerId = 'P-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const peer = { socket, role: 'unknown', deviceId: null, meta: {} };
  peers.set(peerId, peer);

  console.log(`[NEXCAM] Peer connected: ${peerId} (Total: ${peers.size})`);

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) break;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) break;

      const payload = buffer.subarray(offset, offset + payloadLength);
      buffer = buffer.subarray(offset + payloadLength);

      if (isMasked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Handle Opcode
      if (opcode === 0x08) {
        // Close frame
        socket.end();
        break;
      } else if (opcode === 0x09) {
        // Ping -> send Pong
        sendWSFrame(socket, payload, 0x0a);
      } else if (opcode === 0x01) {
        // Text message
        try {
          const text = payload.toString('utf8');
          const msg = JSON.parse(text);
          handleSignalingMessage(peerId, msg);
        } catch (e) {
          console.error('[NEXCAM] Error parsing message:', e);
        }
      }
    }
  });

  socket.on('close', () => {
    peers.delete(peerId);
    console.log(`[NEXCAM] Peer disconnected: ${peerId} (Total: ${peers.size})`);
    broadcastPeerDisconnected(peerId);
  });

  socket.on('error', (err) => {
    console.warn(`[NEXCAM] Socket error on ${peerId}:`, err.message);
  });
});

function sendWSFrame(socket, data, opcode = 0x01) {
  if (!socket.writable) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const length = payload.length;

  let header;
  if (length <= 125) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function handleSignalingMessage(fromPeerId, msg) {
  const { type, targetPeerId, payload } = msg;

  switch (type) {
    case 'register': {
      const p = peers.get(fromPeerId);
      if (p) {
        p.role = msg.role;
        p.deviceId = msg.deviceId;
        p.meta = msg.meta || {};
      }
      sendWSFrame(p.socket, JSON.stringify({ type: 'registered', yourPeerId: fromPeerId }));
      break;
    }

    case 'pair-request': {
      // Find camera peer
      let cameraPeerId = null;
      for (const [pId, pData] of peers.entries()) {
        if (pData.role === 'camera') {
          cameraPeerId = pId;
          break;
        }
      }

      const sender = peers.get(fromPeerId);
      if (cameraPeerId && peers.has(cameraPeerId)) {
        sendWSFrame(peers.get(cameraPeerId).socket, JSON.stringify({
          type: 'pair-request',
          fromPeerId,
          payload
        }));
      } else if (sender) {
        sendWSFrame(sender.socket, JSON.stringify({
          type: 'pair-denied',
          payload: { reason: 'No camera is currently active on this signaling server.' }
        }));
      }
      break;
    }

    case 'pair-approved':
    case 'pair-denied':
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'webrtc-candidate': {
      if (targetPeerId && peers.has(targetPeerId)) {
        sendWSFrame(peers.get(targetPeerId).socket, JSON.stringify({
          type,
          fromPeerId,
          payload
        }));
      }
      break;
    }
  }
}

function broadcastPeerDisconnected(disconnectedPeerId) {
  const note = JSON.stringify({
    type: 'peer-disconnected',
    fromPeerId: disconnectedPeerId
  });

  for (const peer of peers.values()) {
    sendWSFrame(peer.socket, note);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`  NEXCAM CCTV - Live Monitoring Platform`);
  console.log(`  Created By Shiv Yogi`);
  console.log(`======================================================`);
  console.log(`  Local Web Server:       http://localhost:${PORT}`);
  console.log(`  WebSocket Signaling:    ws://localhost:${PORT}/ws`);
  console.log(`  Network Health Check:   http://localhost:${PORT}/health`);
  console.log(`======================================================\n`);
});
