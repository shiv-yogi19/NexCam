/**
 * NEXCAM CCTV - WebRTC Peer Connection & Signaling Engine
 * Multi-Display & Multi-Camera Full-Duplex Mesh
 * Created By Shiv Yogi
 */

class NexcamWebRTC {
  constructor() {
    this.STORAGE_KEY_SIGNALING_URL = 'nexcam_signaling_url';
    this.STORAGE_KEY_TURN_CONFIG = 'nexcam_turn_config';

    // Default signaling URL: checks window.location or fallback to local port 8080
    this.signalingUrl = this.getDefaultSignalingUrl();
    this.turnConfig = this.loadTurnConfig();

    this.ws = null;
    this.wsConnected = false;
    this.reconnectTimer = null;
    this.role = null; // 'camera' or 'display'
    this.peerConnections = new Map(); // peerId -> { pc, dc, role, stream, meta, lastPing, rtt }

    // Message handler callbacks
    this.onPairRequestReceived = null; // for Camera: incoming request from Display
    this.onPairApproved = null;        // for Display: camera approved pairing
    this.onPairDenied = null;          // for Display: camera denied pairing
    this.onRemoteStream = null;        // for Display: remote video stream received
    this.onPeerDisconnected = null;    // peer left or closed
    this.onControlMessage = null;      // data channel message
  }

  getDefaultSignalingUrl() {
    const saved = localStorage.getItem(this.STORAGE_KEY_SIGNALING_URL);
    if (saved) return saved;

    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:8080';
      return `${protocol}//${host}/ws`;
    }
    return 'ws://localhost:8080/ws';
  }

  loadTurnConfig() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_TURN_CONFIG);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveTurnConfig(config) {
    this.turnConfig = config;
    localStorage.setItem(this.STORAGE_KEY_TURN_CONFIG, JSON.stringify(config));
  }

  getIceServers() {
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    if (this.turnConfig && this.turnConfig.url) {
      const turnEntry = {
        urls: this.turnConfig.url,
        username: this.turnConfig.username || '',
        credential: this.turnConfig.credential || ''
      };
      servers.push(turnEntry);
    }
    return servers;
  }

  /**
   * Connect to Signaling Server (WebSocket)
   */
  connectSignaling(role, deviceMeta = {}) {
    this.role = role;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.signalingUrl);
    } catch (err) {
      console.warn('Signaling server WebSocket creation failed:', err);
      return;
    }

    this.ws.onopen = () => {
      this.wsConnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Register device on signaling network
      this.sendSignalingMessage({
        type: 'register',
        role: this.role,
        deviceId: window.nexcamSecurity ? window.nexcamSecurity.deviceId : 'NEX-UNKNOWN',
        meta: deviceMeta
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nexcam-signaling-connected'));
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleSignalingMessage(msg);
      } catch (e) {
        console.error('Invalid signaling message:', e);
      }
    };

    this.ws.onerror = (e) => {
      this.wsConnected = false;
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nexcam-signaling-disconnected'));
      }
      // Reconnect after 3 seconds
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connectSignaling(this.role, deviceMeta);
        }, 3000);
      }
    };
  }

  sendSignalingMessage(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Handle Inbound Signaling Messages
   */
  async handleSignalingMessage(msg) {
    const { type, fromPeerId, payload } = msg;

    switch (type) {
      // Inbound Pairing Request to Camera
      case 'pair-request':
        if (this.onPairRequestReceived) {
          this.onPairRequestReceived({
            fromPeerId,
            displayDeviceId: payload.deviceId,
            displayName: payload.displayName || 'Display Device',
            code: payload.code,
            timestamp: payload.timestamp
          });
        }
        break;

      // Approval response to Display
      case 'pair-approved':
        if (this.onPairApproved) {
          this.onPairApproved({ fromPeerId, payload });
        }
        // Initiate WebRTC offer from Display to Camera
        await this.createOffer(fromPeerId);
        break;

      // Denial response to Display
      case 'pair-denied':
        if (this.onPairDenied) {
          this.onPairDenied({ fromPeerId, reason: payload.reason });
        }
        break;

      // SDP Offer
      case 'webrtc-offer':
        await this.handleOffer(fromPeerId, payload.sdp);
        break;

      // SDP Answer
      case 'webrtc-answer':
        await this.handleAnswer(fromPeerId, payload.sdp);
        break;

      // ICE Candidate
      case 'webrtc-candidate':
        await this.handleCandidate(fromPeerId, payload.candidate);
        break;

      // Peer Left
      case 'peer-disconnected':
        this.closePeerConnection(fromPeerId);
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(fromPeerId);
        }
        break;
    }
  }

  /**
   * Create WebRTC RTCPeerConnection for a peer
   */
  createPeerConnection(peerId, isInitiator = false) {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId).pc;
    }

    const config = {
      iceServers: this.getIceServers(),
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    const pc = new RTCPeerConnection(config);
    let dc = null;

    if (isInitiator) {
      // Create DataChannel for control messages
      dc = pc.createDataChannel('nexcam-control', { ordered: true });
      this.setupDataChannel(peerId, dc);
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'webrtc-candidate',
          targetPeerId: peerId,
          payload: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeerConnection(peerId);
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(peerId);
        }
      }
    };

    this.peerConnections.set(peerId, {
      pc,
      dc,
      role: isInitiator ? 'initiator' : 'receiver',
      lastPing: 0,
      rtt: 0
    });

    return pc;
  }

  setupDataChannel(peerId, dc) {
    const entry = this.peerConnections.get(peerId);
    if (entry) entry.dc = dc;

    dc.onopen = () => {
      // Start ping heartbeat for RTT measurement
      entry.pingInterval = setInterval(() => {
        if (dc.readyState === 'open') {
          entry.lastPing = Date.now();
          dc.send(JSON.stringify({ type: 'ping', t: entry.lastPing }));
        }
      }, 5000);
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          dc.send(JSON.stringify({ type: 'pong', t: data.t }));
        } else if (data.type === 'pong') {
          entry.rtt = Date.now() - data.t;
        } else if (this.onControlMessage) {
          this.onControlMessage(peerId, data);
        }
      } catch (err) {
        console.error('DataChannel parse error:', err);
      }
    };

    dc.onclose = () => {
      if (entry && entry.pingInterval) {
        clearInterval(entry.pingInterval);
      }
    };
  }

  sendControlMessage(peerId, messageObj) {
    const entry = this.peerConnections.get(peerId);
    if (entry && entry.dc && entry.dc.readyState === 'open') {
      entry.dc.send(JSON.stringify(messageObj));
      return true;
    }
    return false;
  }

  broadcastControlMessage(messageObj) {
    for (const [peerId, entry] of this.peerConnections.entries()) {
      if (entry.dc && entry.dc.readyState === 'open') {
        entry.dc.send(JSON.stringify(messageObj));
      }
    }
  }

  /**
   * SDP Negotiation
   */
  async createOffer(peerId) {
    const pc = this.createPeerConnection(peerId, true);
    const offer = await pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true
    });
    await pc.setLocalDescription(offer);

    this.sendSignalingMessage({
      type: 'webrtc-offer',
      targetPeerId: peerId,
      payload: { sdp: pc.localDescription }
    });
  }

  async handleOffer(peerId, sdp) {
    const pc = this.createPeerConnection(peerId, false);

    // If Camera Device, attach local camera tracks
    if (window.nexcamCamera && window.nexcamCamera.localStream) {
      window.nexcamCamera.localStream.getTracks().forEach(track => {
        pc.addTrack(track, window.nexcamCamera.localStream);
      });
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignalingMessage({
      type: 'webrtc-answer',
      targetPeerId: peerId,
      payload: { sdp: pc.localDescription }
    });
  }

  async handleAnswer(peerId, sdp) {
    const entry = this.peerConnections.get(peerId);
    if (entry && entry.pc) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async handleCandidate(peerId, candidate) {
    const entry = this.peerConnections.get(peerId);
    if (entry && entry.pc) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Error adding ICE candidate', e);
      }
    }
  }

  closePeerConnection(peerId) {
    const entry = this.peerConnections.get(peerId);
    if (entry) {
      if (entry.pingInterval) clearInterval(entry.pingInterval);
      if (entry.dc) entry.dc.close();
      if (entry.pc) entry.pc.close();
      this.peerConnections.delete(peerId);
    }
  }

  closeAllConnections() {
    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamWebRTC = new NexcamWebRTC();
}

export default NexcamWebRTC;
export { NexcamWebRTC };

