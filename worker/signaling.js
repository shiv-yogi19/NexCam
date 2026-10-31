/**
 * Cloudflare Worker - WebRTC Signaling & Pairing Relay
 * NEXCAM CCTV
 * Created By Shiv Yogi
 */

import { PairingCoordinator } from './pairing.js';
import { SessionCoordinator } from './sessions.js';

const pairing = new PairingCoordinator();
const sessions = new SessionCoordinator();
const peers = new Map(); // peerId -> { ws, role, deviceId, meta }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        app: 'NEXCAM CCTV',
        creator: 'Created By Shiv Yogi',
        activePeers: peers.size
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Upgrade WebSocket
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      const peerId = 'P-' + Math.random().toString(36).substring(2, 9).toUpperCase();

      server.addEventListener('message', async (event) => {
        try {
          const msg = JSON.parse(event.data);
          handlePeerMessage(peerId, server, msg, request);
        } catch (e) {
          console.error('Signaling parse error:', e);
        }
      });

      server.addEventListener('close', () => {
        peers.delete(peerId);
        broadcastPeerDisconnected(peerId);
      });

      peers.set(peerId, { ws: server, role: 'unknown', deviceId: null });

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return new Response('NEXCAM CCTV Signaling Service - Created By Shiv Yogi', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

function handlePeerMessage(fromPeerId, ws, msg, request) {
  const { type, targetPeerId, payload } = msg;

  switch (type) {
    case 'register': {
      const entry = peers.get(fromPeerId);
      if (entry) {
        entry.role = msg.role;
        entry.deviceId = msg.deviceId;
        entry.meta = msg.meta;
      }
      ws.send(JSON.stringify({ type: 'registered', yourPeerId: fromPeerId }));
      break;
    }

    case 'pair-request': {
      // Display requests to pair with camera using 8-char code
      const clientIp = request.headers.get('CF-Connecting-IP') || 'local-ip';
      const code = payload.code;

      // Find camera peer
      let cameraPeerId = null;
      for (const [pId, pData] of peers.entries()) {
        if (pData.role === 'camera') {
          cameraPeerId = pId;
          break;
        }
      }

      if (cameraPeerId && peers.has(cameraPeerId)) {
        peers.get(cameraPeerId).ws.send(JSON.stringify({
          type: 'pair-request',
          fromPeerId,
          payload
        }));
      } else {
        ws.send(JSON.stringify({
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
      // Forward directly to target peer
      if (targetPeerId && peers.has(targetPeerId)) {
        peers.get(targetPeerId).ws.send(JSON.stringify({
          type,
          fromPeerId,
          payload
        }));
      }
      break;
    }

    case 'heartbeat': {
      if (payload && payload.sessionId) {
        sessions.touchSession(payload.sessionId);
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
    if (peer.ws.readyState === 1) { // OPEN
      peer.ws.send(note);
    }
  }
}
