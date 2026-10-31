/**
 * NEXCAM CCTV - Display Device Controller
 * Multi-Camera Grid, Remote Switching, Telemetry & Recording Coordinator
 * Created By Shiv Yogi
 */

class NexcamDisplay {
  constructor() {
    this.cameras = new Map(); // peerId -> { peerId, name, stream, isLocked, isMuted, stats, battery, network, videoEl, cardEl }
    this.activeFocusCameraId = null;
    this.statsPollInterval = null;
  }

  initUI() {
    this.setupSignalingCallbacks();
    this.startStatsPolling();
    this.renderCamerasGrid();
  }

  setupSignalingCallbacks() {
    if (!window.nexcamWebRTC) return;

    window.nexcamWebRTC.onPairApproved = ({ fromPeerId, payload }) => {
      if (window.showToast) {
        window.showToast(`Pairing approved by ${payload.cameraName || 'Camera'}!`, 'success');
      }
      this.addOrUpdateCamera(fromPeerId, {
        name: payload.cameraName || 'Remote Camera',
        isLocked: payload.isLocked,
        isMuted: !payload.isMicActive
      });
    };

    window.nexcamWebRTC.onPairDenied = ({ reason }) => {
      if (window.showToast) {
        window.showToast(`Pairing Denied: ${reason || 'Rejected by camera'}`, 'error');
      }
    };

    window.nexcamWebRTC.onRemoteStream = (peerId, stream) => {
      this.attachRemoteStream(peerId, stream);
    };

    window.nexcamWebRTC.onPeerDisconnected = (peerId) => {
      this.removeCamera(peerId);
      if (window.showToast) {
        window.showToast(`Camera ${peerId} disconnected.`, 'warning');
      }
    };

    window.nexcamWebRTC.onControlMessage = (peerId, msg) => {
      this.handleCameraControlMessage(peerId, msg);
    };
  }

  /**
   * Initiate Pairing Request to Camera
   */
  requestPairing(code) {
    if (!window.nexcamPairing || !window.nexcamPairing.isValidCodeFormat(code)) {
      if (window.showToast) {
        window.showToast('Please enter a valid 8-character pairing code.', 'warning');
      }
      return false;
    }

    if (!window.nexcamWebRTC || !window.nexcamWebRTC.wsConnected) {
      if (window.showToast) {
        window.showToast('Connecting to signaling network... please wait.', 'info');
      }
    }

    const deviceId = window.nexcamSecurity ? window.nexcamSecurity.deviceId : 'NEX-DISPLAY';
    const displayName = 'Display (' + deviceId.slice(-4) + ')';

    window.nexcamWebRTC.sendSignalingMessage({
      type: 'pair-request',
      payload: {
        code: code.trim().toUpperCase(),
        deviceId,
        displayName,
        timestamp: Date.now()
      }
    });

    if (window.showToast) {
      window.showToast('Pairing request sent. Awaiting camera approval...', 'info');
    }
    return true;
  }

  addOrUpdateCamera(peerId, meta = {}) {
    const existing = this.cameras.get(peerId) || {};
    const updated = {
      peerId,
      name: meta.name || existing.name || 'Remote Camera',
      stream: meta.stream || existing.stream || null,
      isLocked: meta.isLocked !== undefined ? meta.isLocked : (existing.isLocked || false),
      isMuted: meta.isMuted !== undefined ? meta.isMuted : (existing.isMuted || false),
      stats: existing.stats || { fps: 0, resolution: 'Connecting...', latencyMs: 0 },
      battery: meta.battery || existing.battery || null,
      network: meta.network || existing.network || null,
      videoEl: existing.videoEl || null,
      cardEl: existing.cardEl || null
    };

    this.cameras.set(peerId, updated);
    if (!this.activeFocusCameraId) {
      this.activeFocusCameraId = peerId;
    }

    this.renderCamerasGrid();
  }

  attachRemoteStream(peerId, stream) {
    let cam = this.cameras.get(peerId);
    if (!cam) {
      this.addOrUpdateCamera(peerId, { stream });
      cam = this.cameras.get(peerId);
    } else {
      cam.stream = stream;
    }

    if (cam.videoEl) {
      cam.videoEl.srcObject = stream;
      cam.videoEl.play().catch(e => console.warn('Display autoplay error:', e));
    } else {
      this.renderCamerasGrid();
    }

    if (window.showToast) {
      window.showToast(`Live feed received from ${cam.name}`, 'success');
    }
  }

  removeCamera(peerId) {
    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.closePeerConnection(peerId);
    }
    this.cameras.delete(peerId);
    if (this.activeFocusCameraId === peerId) {
      this.activeFocusCameraId = this.cameras.keys().next().value || null;
    }
    this.renderCamerasGrid();
  }

  /**
   * Request Remote Front/Back Camera Switch (Section 13)
   */
  requestRemoteCameraSwitch(peerId) {
    const cam = this.cameras.get(peerId);
    if (!cam) return;

    if (cam.isLocked) {
      if (window.showToast) {
        window.showToast(`Cannot switch camera: Camera Lock is active on ${cam.name}`, 'warning');
      }
      return;
    }

    if (window.nexcamWebRTC) {
      window.nexcamWebRTC.sendControlMessage(peerId, {
        type: 'switchCamera'
      });
      if (window.showToast) {
        window.showToast(`Requested lens switch on ${cam.name}`, 'info');
      }
    }
  }

  /**
   * Handle Inbound Control Messages from Camera
   */
  handleCameraControlMessage(peerId, msg) {
    const cam = this.cameras.get(peerId);
    if (!cam) return;

    switch (msg.type) {
      case 'error':
        if (msg.code === 'CAMERA_LOCKED_ERROR') {
          cam.isLocked = true;
          this.updateCardHeader(cam);
          if (window.showToast) {
            window.showToast(`${cam.name}: ${msg.message}`, 'warning');
          }
        }
        break;

      case 'cameraInfo':
        cam.name = msg.cameraName || cam.name;
        cam.isLocked = msg.isLocked;
        cam.isMuted = !msg.isMicActive;
        this.updateCardHeader(cam);
        break;

      case 'telemetry':
        cam.battery = msg.battery;
        cam.network = msg.network;
        this.updateCardTelemetry(cam);
        break;
    }
  }

  /**
   * Render Multi-Camera Grid
   */
  renderCamerasGrid() {
    const grid = document.getElementById('multi-camera-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (this.cameras.size === 0) {
      grid.innerHTML = `
        <div class="glass-panel" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:40px; gap:16px;">
          <div style="width:64px; height:64px; color:var(--accent-cyan); opacity:0.8;">
            ${window.getIcon ? window.getIcon('camera') : ''}
          </div>
          <div>
            <h3 style="font-size:var(--text-lg); margin-bottom:6px;">No Live Cameras Connected</h3>
            <p style="font-size:var(--text-xs); color:var(--color-text-secondary); max-width:320px; margin:0 auto;">
              Enter an 8-character pairing code or scan the Camera QR code to view live feeds.
            </p>
          </div>
          <button class="glass-btn glass-btn-primary" onclick="document.getElementById('display-pair-modal').style.display='flex'">
            ${window.getIcon ? window.getIcon('plus') : ''} Connect to Camera
          </button>
        </div>
      `;
      return;
    }

    for (const [peerId, cam] of this.cameras.entries()) {
      const card = document.createElement('div');
      card.className = 'cam-card';
      card.setAttribute('data-cam-id', peerId);

      if (this.activeFocusCameraId === peerId) {
        card.classList.add('focused', 'active-focus', 'primary-focus');
      }

      // Card Header
      card.innerHTML = `
        <div class="cam-card-header">
          <div class="cam-label-tag">
            <span class="cam-name-text">${cam.name}</span>
            <span class="glass-badge live" style="padding:2px 6px; font-size:10px;"><span class="dot"></span> LIVE</span>
            <span class="cam-lock-icon" style="display:${cam.isLocked ? 'inline-flex' : 'none'}; color:var(--accent-cyan);">
              ${window.getIcon ? window.getIcon('lock') : ''}
            </span>
          </div>
          <div class="cam-stats-tag glass-badge" style="font-size:10px;">
            <span class="stat-fps">-- FPS</span> | <span class="stat-res">--</span>
          </div>
        </div>

        <div class="cam-card-video-wrap">
          <video autoplay playsinline muted></video>
        </div>

        <div class="cam-card-controls-overlay">
          <div style="display:flex; gap:6px;">
            <button class="glass-btn" style="padding:6px; border-radius:50%;" title="Switch Front/Back Camera" onclick="window.nexcamDisplay.requestRemoteCameraSwitch('${peerId}')">
              ${window.getIcon ? window.getIcon('cameraSwitch') : ''}
            </button>
            <button class="glass-btn" style="padding:6px; border-radius:50%;" title="Toggle Audio Playback" onclick="window.nexcamDisplay.toggleAudio('${peerId}')">
              ${window.getIcon ? window.getIcon('mic') : ''}
            </button>
            <button class="glass-btn" style="padding:6px; border-radius:50%;" title="Capture High-Res Snapshot" onclick="window.nexcamDisplay.takeSnapshot('${peerId}')">
              ${window.getIcon ? window.getIcon('snapshot') : ''}
            </button>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="glass-btn" style="padding:6px; border-radius:50%;" title="Full Screen" onclick="window.nexcamDisplay.toggleCameraFullscreen('${peerId}')">
              ${window.getIcon ? window.getIcon('maximize') : ''}
            </button>
            <button class="glass-btn glass-btn-danger" style="padding:6px; border-radius:50%;" title="Disconnect Camera" onclick="window.nexcamDisplay.removeCamera('${peerId}')">
              ${window.getIcon ? window.getIcon('disconnect') : ''}
            </button>
          </div>
        </div>
      `;

      // Set video element
      const videoEl = card.querySelector('video');
      cam.videoEl = videoEl;
      cam.cardEl = card;

      if (cam.stream) {
        videoEl.srcObject = cam.stream;
        videoEl.play().catch(e => console.warn('Play error:', e));
      }

      // Click to focus camera
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          this.activeFocusCameraId = peerId;
          if (window.nexcamLayout) {
            window.nexcamLayout.setFocusedCamera(peerId);
          }
        }
      });

      grid.appendChild(card);
    }

    if (window.nexcamLayout) {
      window.nexcamLayout.refreshGridFocusClasses();
    }
  }

  updateCardHeader(cam) {
    if (!cam.cardEl) return;
    const nameEl = cam.cardEl.querySelector('.cam-name-text');
    const lockEl = cam.cardEl.querySelector('.cam-lock-icon');
    if (nameEl) nameEl.textContent = cam.name;
    if (lockEl) lockEl.style.display = cam.isLocked ? 'inline-flex' : 'none';
  }

  updateCardTelemetry(cam) {
    if (!cam.cardEl) return;
    // Update live FPS and resolution badge
    const statsTag = cam.cardEl.querySelector('.cam-stats-tag');
    if (statsTag && cam.stats) {
      statsTag.innerHTML = `<span class="stat-fps">${cam.stats.fps} FPS</span> | <span class="stat-res">${cam.stats.resolution}</span>`;
    }
  }

  toggleAudio(peerId) {
    const cam = this.cameras.get(peerId);
    if (!cam || !cam.videoEl) return;

    cam.videoEl.muted = !cam.videoEl.muted;
    if (window.showToast) {
      window.showToast(`${cam.name} Audio: ${cam.videoEl.muted ? 'MUTED' : 'UNMUTED'}`, 'info');
    }
  }

  takeSnapshot(peerId) {
    const cam = this.cameras.get(peerId);
    if (!cam || !cam.videoEl) {
      if (window.showToast) window.showToast('No active video feed for snapshot.', 'warning');
      return;
    }

    if (window.nexcamRecording) {
      try {
        window.nexcamRecording.captureSnapshot(cam.videoEl, cam.name);
        if (window.showToast) {
          window.showToast(`Snapshot captured: ${cam.name}`, 'success');
        }
      } catch (err) {
        if (window.showToast) window.showToast(err.message, 'error');
      }
    }
  }

  toggleRecordActiveCamera() {
    const cam = this.cameras.get(this.activeFocusCameraId) || this.cameras.values().next().value;
    if (!cam || !cam.stream) {
      if (window.showToast) window.showToast('No active camera feed to record.', 'warning');
      return;
    }

    if (!window.nexcamRecording) return;

    if (window.nexcamRecording.isRecording) {
      window.nexcamRecording.stopRecording();
      if (window.showToast) window.showToast('Recording stopped. File saved.', 'info');
    } else {
      try {
        window.nexcamRecording.startRecording(cam.stream);
        if (window.showToast) window.showToast(`Recording started on ${cam.name}`, 'success');
      } catch (e) {
        if (window.showToast) window.showToast(e.message, 'error');
      }
    }
  }

  toggleCameraFullscreen(peerId) {
    const cam = this.cameras.get(peerId);
    if (!cam || !cam.cardEl) return;

    if (!document.fullscreenElement) {
      cam.cardEl.requestFullscreen().catch(err => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.warn('Exit fullscreen error:', err);
      });
    }
  }

  startStatsPolling() {
    if (this.statsPollInterval) clearInterval(this.statsPollInterval);
    this.statsPollInterval = setInterval(async () => {
      if (this.cameras.size === 0 || !window.nexcamWebRTC) return;

      for (const [peerId, cam] of this.cameras.entries()) {
        const entry = window.nexcamWebRTC.peerConnections.get(peerId);
        if (entry && entry.pc && window.nexcamDeviceMonitor) {
          cam.stats = await window.nexcamDeviceMonitor.getPeerConnectionStats(entry.pc);
          this.updateCardTelemetry(cam);
        }
      }
    }, 2000);
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamDisplay = new NexcamDisplay();
}

export default NexcamDisplay;
export { NexcamDisplay };

