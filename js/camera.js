/**
 * NEXCAM CCTV - Camera Device Controller
 * Camera Feed, Device Lock, Microphone Controls, Black Screen & Display Approvals
 * Created By Shiv Yogi
 */

class NexcamCamera {
  constructor() {
    this.STORAGE_KEY_CAM_NAME = 'nexcam_cam_name';
    this.STORAGE_KEY_CAM_LOCK = 'nexcam_cam_lock';
    this.STORAGE_KEY_BLACK_TIMEOUT = 'nexcam_black_screen_timeout';

    this.cameraName = localStorage.getItem(this.STORAGE_KEY_CAM_NAME) || 'Front Entrance Camera';
    this.isCameraLocked = localStorage.getItem(this.STORAGE_KEY_CAM_LOCK) === 'true';
    this.blackScreenTimeoutSec = parseInt(localStorage.getItem(this.STORAGE_KEY_BLACK_TIMEOUT) || '60', 10);

    this.localStream = null;
    this.facingMode = 'environment'; // default to back camera
    this.isMicActive = true;
    this.isStreaming = false;

    // Black Screen Mode State
    this.isBlackScreenActive = false;
    this.inactivityTimer = null;

    // Connected Displays Table
    this.connectedDisplays = new Map(); // peerId -> { deviceId, displayName, connectedAt, status, sId }
    this.pendingRequests = []; // queue of { fromPeerId, displayDeviceId, displayName, code, timestamp }

    // Telemetry Interval
    this.telemetryInterval = null;
  }

  initUI() {
    const nameInput = document.getElementById('camera-name-input');
    if (nameInput) {
      nameInput.value = this.cameraName;
      nameInput.addEventListener('change', (e) => {
        this.cameraName = e.target.value.trim() || 'Camera';
        localStorage.setItem(this.STORAGE_KEY_CAM_NAME, this.cameraName);
        this.broadcastCameraInfo();
      });
    }

    this.updateLockUI();
    this.setupInactivityListener();
    this.bindControlHandlers();
  }

  bindControlHandlers() {
    // WebRTC signaling integration
    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.onPairRequestReceived = (req) => this.handleIncomingPairRequest(req);
      window.nexcamWebRTC.onPeerDisconnected = (peerId) => this.handlePeerDisconnected(peerId);
      window.nexcamWebRTC.onControlMessage = (peerId, msg) => this.handleRemoteControlMessage(peerId, msg);
    }
  }

  /**
   * Start Camera Capture via MediaDevices API
   */
  async startCamera(constraints = {}) {
    if (this.localStream) {
      this.stopCamera();
    }

    const defaultConstraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: this.isMicActive
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        ...defaultConstraints,
        ...constraints
      });

      const videoEl = document.getElementById('camera-video-element');
      if (videoEl) {
        videoEl.srcObject = this.localStream;
        await videoEl.play().catch(e => console.warn('Autoplay prevented:', e));
      }

      this.isStreaming = true;
      this.updateCameraStatusBadge(true);
      this.startTelemetryUpdates();
      this.resetInactivityTimer();

      // Attach tracks to any already open peer connections
      if (window.nexcamWebRTC) {
        for (const [peerId, entry] of window.nexcamWebRTC.peerConnections.entries()) {
          const senders = entry.pc.getSenders();
          this.localStream.getTracks().forEach(track => {
            const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
            if (existingSender) {
              existingSender.replaceTrack(track);
            } else {
              entry.pc.addTrack(track, this.localStream);
            }
          });
        }
      }

      if (window.showToast) {
        window.showToast(`Camera started: ${this.facingMode === 'user' ? 'Front' : 'Back'} lens`, 'success');
      }

      return true;
    } catch (err) {
      console.error('Camera access failed:', err);
      let errorMsg = 'Failed to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera/Microphone permission was denied by the browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No suitable camera device found on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is already in use by another application.';
      }

      if (window.showToast) {
        window.showToast(errorMsg, 'error');
      }
      return false;
    }
  }

  /**
   * Stop Camera MediaStream Tracks
   */
  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    const videoEl = document.getElementById('camera-video-element');
    if (videoEl) {
      videoEl.srcObject = null;
    }

    this.isStreaming = false;
    this.updateCameraStatusBadge(false);
    this.stopTelemetryUpdates();
  }

  /**
   * Switch Front / Back Camera
   */
  async switchCamera(requestedFacingMode = null) {
    this.facingMode = requestedFacingMode || (this.facingMode === 'user' ? 'environment' : 'user');
    await this.startCamera();
    this.broadcastCameraInfo();
  }

  /**
   * Camera Lock Toggle (Display Device cannot switch camera if locked)
   */
  toggleCameraLock() {
    this.isCameraLocked = !this.isCameraLocked;
    localStorage.setItem(this.STORAGE_KEY_CAM_LOCK, this.isCameraLocked.toString());
    this.updateLockUI();

    if (window.showToast) {
      window.showToast(`Camera Lock: ${this.isCameraLocked ? 'LOCKED (Remote changes rejected)' : 'UNLOCKED'}`, 'info');
    }

    this.broadcastCameraInfo();
  }

  updateLockUI() {
    const lockBtn = document.getElementById('camera-lock-btn');
    const lockBadge = document.getElementById('camera-lock-badge');
    const iconSpan = document.getElementById('camera-lock-icon');

    if (lockBtn) {
      lockBtn.innerHTML = this.isCameraLocked
        ? `${window.getIcon ? window.getIcon('lock') : ''} Locked`
        : `${window.getIcon ? window.getIcon('unlock') : ''} Unlocked`;
      if (this.isCameraLocked) {
        lockBtn.classList.add('glass-btn-primary');
      } else {
        lockBtn.classList.remove('glass-btn-primary');
      }
    }

    if (lockBadge) {
      lockBadge.style.display = this.isCameraLocked ? 'inline-flex' : 'none';
    }
  }

  /**
   * Microphone On/Off Toggle
   */
  toggleMicrophone() {
    this.isMicActive = !this.isMicActive;

    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = this.isMicActive;
      });
    }

    const micBtn = document.getElementById('camera-mic-btn');
    if (micBtn) {
      micBtn.innerHTML = this.isMicActive
        ? `${window.getIcon ? window.getIcon('mic') : ''} Mic ON`
        : `${window.getIcon ? window.getIcon('micOff') : ''} Mic OFF`;
    }

    if (window.showToast) {
      window.showToast(`Microphone: ${this.isMicActive ? 'ENABLED' : 'MUTED'}`, 'info');
    }

    this.broadcastCameraInfo();
  }

  /**
   * ULTRA-DARK BLACK SCREEN BATTERY-SAVING MODE (SECTION 15)
   * Displays pure #000000 screen while camera & stream continue running.
   */
  enableBlackScreenMode() {
    this.isBlackScreenActive = true;
    document.body.classList.add('black-screen-active');

    const overlay = document.getElementById('black-screen-overlay');
    if (overlay) {
      overlay.classList.add('active');
    }

    if (window.nexcamSecurity) {
      window.nexcamSecurity.logEvent('BATTERY_SAVER', 'Ultra-Dark Black Screen Mode activated.');
    }
  }

  disableBlackScreenMode() {
    this.isBlackScreenActive = false;
    document.body.classList.remove('black-screen-active');

    const overlay = document.getElementById('black-screen-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }

    this.resetInactivityTimer();
  }

  setupInactivityListener() {
    const resetFn = () => {
      if (this.isBlackScreenActive) {
        this.disableBlackScreenMode();
      } else {
        this.resetInactivityTimer();
      }
    };

    window.addEventListener('pointerdown', resetFn, { passive: true });
    window.addEventListener('keydown', resetFn, { passive: true });
  }

  resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    // Only set auto-timer if camera is actively streaming and timeout > 0
    if (this.isStreaming && this.blackScreenTimeoutSec > 0) {
      this.inactivityTimer = setTimeout(() => {
        this.enableBlackScreenMode();
      }, this.blackScreenTimeoutSec * 1000);
    }
  }

  /**
   * Handle Remote Control Messages from Display Devices via DataChannel
   */
  handleRemoteControlMessage(peerId, msg) {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'switchCamera':
        // Enforce Camera Lock Logic (Section 13)
        if (this.isCameraLocked) {
          if (window.nexcamWebRTC) {
            window.nexcamWebRTC.sendControlMessage(peerId, {
              type: 'error',
              code: 'CAMERA_LOCKED_ERROR',
              message: 'Camera switching is currently locked by the Camera Owner.'
            });
          }
          if (window.showToast) {
            window.showToast(`Rejected unauthorized remote camera switch from Display (${peerId})`, 'warning');
          }
          return;
        }

        // Switch camera if unlocked
        this.switchCamera(msg.facingMode);
        break;

      case 'requestAudio':
        // Display requests audio stream status
        if (window.nexcamWebRTC) {
          window.nexcamWebRTC.sendControlMessage(peerId, {
            type: 'audioStatus',
            isMicActive: this.isMicActive
          });
        }
        break;
    }
  }

  /**
   * Incoming Pairing Request from a Display Device
   */
  handleIncomingPairRequest(req) {
    const { fromPeerId, displayDeviceId, displayName, code } = req;

    // Check rate limit & blocked device
    if (window.nexcamSecurity) {
      if (window.nexcamSecurity.isDeviceBlocked(displayDeviceId)) {
        this.denyDisplayRequest(fromPeerId, 'Device is blocked by Camera Owner.');
        return;
      }

      const rateCheck = window.nexcamSecurity.checkRateLimit(displayDeviceId);
      if (!rateCheck.allowed) {
        this.denyDisplayRequest(fromPeerId, `Rate limit exceeded. Try again in ${rateCheck.remainingSeconds}s.`);
        return;
      }
    }

    // Validate Pairing Code
    if (window.nexcamPairing) {
      const valResult = window.nexcamPairing.validateIncomingCode(code);
      if (!valResult.valid) {
        if (window.nexcamSecurity) {
          window.nexcamSecurity.recordFailedAttempt(displayDeviceId);
        }
        this.denyDisplayRequest(fromPeerId, valResult.message);
        return;
      }
    }

    // Show Approval Confirmation Modal to Camera Owner
    this.showPairingApprovalModal(req);
  }

  showPairingApprovalModal(req) {
    const modal = document.getElementById('camera-approval-modal');
    if (!modal) {
      // Auto-approve if modal element doesn't exist
      this.approveDisplayRequest(req);
      return;
    }

    const titleEl = document.getElementById('approval-display-name');
    const idEl = document.getElementById('approval-device-id');
    const approveBtn = document.getElementById('btn-approve-pairing');
    const denyBtn = document.getElementById('btn-deny-pairing');

    if (titleEl) titleEl.textContent = req.displayName || 'Display Device';
    if (idEl) idEl.textContent = req.displayDeviceId || req.fromPeerId;

    modal.style.display = 'flex';

    approveBtn.onclick = () => {
      modal.style.display = 'none';
      this.approveDisplayRequest(req);
    };

    denyBtn.onclick = () => {
      modal.style.display = 'none';
      this.denyDisplayRequest(req.fromPeerId, 'Connection rejected by camera owner.');
    };
  }

  approveDisplayRequest(req) {
    const { fromPeerId, displayDeviceId, displayName } = req;

    // Invalidate pairing code after single successful use
    if (window.nexcamPairing) {
      window.nexcamPairing.invalidateCurrentCode();
    }

    // Register active session in security manager
    const sessionId = 'SESS-' + Date.now().toString(36);
    if (window.nexcamSecurity) {
      window.nexcamSecurity.registerActiveSession(sessionId, {
        deviceId: displayDeviceId,
        deviceName: displayName,
        peerId: fromPeerId,
        role: 'display'
      });
      window.nexcamSecurity.resetFailedAttempts(displayDeviceId);
    }

    this.connectedDisplays.set(fromPeerId, {
      deviceId: displayDeviceId,
      displayName: displayName || 'Display Device',
      connectedAt: Date.now(),
      status: 'Connected',
      sessionId
    });

    // Send Approval via signaling
    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.sendSignalingMessage({
        type: 'pair-approved',
        targetPeerId: fromPeerId,
        payload: {
          sessionId,
          cameraName: this.cameraName,
          isLocked: this.isCameraLocked,
          isMicActive: this.isMicActive
        }
      });
    }

    this.updateConnectedDisplaysList();
    if (window.showToast) {
      window.showToast(`Display connected: ${displayName}`, 'success');
    }
  }

  denyDisplayRequest(fromPeerId, reason) {
    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.sendSignalingMessage({
        type: 'pair-denied',
        targetPeerId: fromPeerId,
        payload: { reason }
      });
    }
  }

  disconnectDisplay(peerId) {
    const disp = this.connectedDisplays.get(peerId);
    if (disp && window.nexcamSecurity) {
      window.nexcamSecurity.revokeSession(disp.sessionId, 'Disconnected by owner');
    }

    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.sendControlMessage(peerId, { type: 'disconnect' });
      window.nexcamWebRTC.closePeerConnection(peerId);
    }

    this.connectedDisplays.delete(peerId);
    this.updateConnectedDisplaysList();
  }

  revokeDisplaySession(peerId) {
    const disp = this.connectedDisplays.get(peerId);
    if (disp) {
      if (window.nexcamSecurity) {
        window.nexcamSecurity.blockDevice(disp.deviceId, 'Session revoked by Camera Owner');
      }
      this.disconnectDisplay(peerId);
      if (window.showToast) {
        window.showToast(`Revoked & blocked: ${disp.displayName}`, 'warning');
      }
    }
  }

  disconnectAllDisplays() {
    for (const peerId of Array.from(this.connectedDisplays.keys())) {
      this.disconnectDisplay(peerId);
    }
  }

  handlePeerDisconnected(peerId) {
    this.connectedDisplays.delete(peerId);
    this.updateConnectedDisplaysList();
  }

  updateConnectedDisplaysList() {
    const listEl = document.getElementById('connected-displays-list');
    const countBadge = document.getElementById('connected-displays-count');
    if (countBadge) {
      countBadge.textContent = this.connectedDisplays.size;
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.connectedDisplays.size === 0) {
      listEl.innerHTML = `<div style="padding:12px; color:var(--color-text-muted); font-size:var(--text-xs); text-align:center;">No displays connected</div>`;
      return;
    }

    for (const [peerId, disp] of this.connectedDisplays.entries()) {
      const item = document.createElement('div');
      item.className = 'glass-panel-subtle';
      item.style.padding = '10px';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.marginBottom = '6px';

      item.innerHTML = `
        <div>
          <div style="font-weight:600; font-size:var(--text-xs); color:#ffffff;">${disp.displayName}</div>
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--color-text-muted);">${disp.deviceId}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="window.nexcamCamera.disconnectDisplay('${peerId}')">Disconnect</button>
          <button class="glass-btn" style="padding:4px 8px; font-size:11px;" onclick="window.nexcamCamera.revokeDisplaySession('${peerId}')">Revoke</button>
        </div>
      `;
      listEl.appendChild(item);
    }
  }

  broadcastCameraInfo() {
    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.broadcastControlMessage({
        type: 'cameraInfo',
        cameraName: this.cameraName,
        facingMode: this.facingMode,
        isLocked: this.isCameraLocked,
        isMicActive: this.isMicActive
      });
    }
  }

  updateCameraStatusBadge(isLive) {
    const badge = document.getElementById('camera-live-badge');
    if (badge) {
      if (isLive) {
        badge.className = 'glass-badge live';
        badge.innerHTML = '<span class="dot"></span> LIVE';
      } else {
        badge.className = 'glass-badge offline';
        badge.innerHTML = '<span class="dot"></span> STANDBY';
      }
    }
  }

  startTelemetryUpdates() {
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);
    this.telemetryInterval = setInterval(async () => {
      if (!this.isStreaming) return;

      if (window.nexcamDeviceMonitor) {
        const battery = window.nexcamDeviceMonitor.getBatteryInfo();
        const network = window.nexcamDeviceMonitor.getNetworkInfo();

        const batEl = document.getElementById('cam-telemetry-battery');
        const netEl = document.getElementById('cam-telemetry-network');

        if (batEl) batEl.textContent = battery.displayText;
        if (netEl) netEl.textContent = network.displayText;

        // Broadcast telemetry to connected displays
        if (window.nexcamWebRTC) {
          window.nexcamWebRTC.broadcastControlMessage({
            type: 'telemetry',
            battery,
            network
          });
        }
      }
    }, 4000);
  }

  stopTelemetryUpdates() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamCamera = new NexcamCamera();
}

export default NexcamCamera;
export { NexcamCamera };

