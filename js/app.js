/**
 * NEXCAM CCTV - Core Application Orchestrator
 * Premium Multi-Device CCTV Monitoring Platform
 * Created By Shiv Yogi
 */

class NexcamApp {
  constructor() {
    this.STORAGE_KEY_MODE = 'nexcam_active_mode';
    this.currentMode = localStorage.getItem(this.STORAGE_KEY_MODE) || 'camera';
  }

  async init() {
    // 1. Run Branded Intro Splash Animation (App Name First, Then Created By Shiv Yogi)
    this.playIntroAnimation();

    // 2. Register Service Worker for PWA
    this.registerServiceWorker();

    // 3. Initialize Layout and Typography
    if (window.nexcamLayout) window.nexcamLayout.init();

    // 4. Initialize Security Monitoring
    if (window.nexcamSecurity) {
      window.nexcamSecurity.startSecurityMonitoring((alert) => {
        this.handleSecurityAlert(alert);
      });
    }

    // 5. Initialize UI Components and Listeners
    this.bindGlobalEvents();
    this.setupModals();
    this.setupSettingsUI();

    // 6. Switch to Active Mode
    this.switchMode(this.currentMode);

    console.log('NEXCAM CCTV initialized. Created By Shiv Yogi.');
  }

  /**
   * Branded Intro Animation (Section 2)
   * Displays "NEXCAM CCTV" first, followed by "Created By Shiv Yogi".
   * No skip button as required.
   */
  playIntroAnimation() {
    const splash = document.getElementById('intro-splash');
    if (!splash) return;

    // Splash displays with CSS keyframe sequence:
    // 0.2s: Logo appears
    // 0.4s: NEXCAM CCTV title animates
    // 1.1s: Created By Shiv Yogi animates
    // At 2.6s: Splash fades out smoothly
    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.style.display = 'none';
      }, 800);
    }, 2600);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => console.log('NEXCAM ServiceWorker registered'))
          .catch(err => console.warn('ServiceWorker registration error:', err));
      });
    }
  }

  switchMode(mode) {
    this.currentMode = mode;
    localStorage.setItem(this.STORAGE_KEY_MODE, mode);

    const camView = document.getElementById('camera-mode-view');
    const dispView = document.getElementById('display-mode-view');
    const camTab = document.getElementById('tab-mode-camera');
    const dispTab = document.getElementById('tab-mode-display');

    if (mode === 'camera') {
      camView.style.display = 'flex';
      dispView.style.display = 'none';
      camTab.classList.add('active');
      dispTab.classList.remove('active');

      // Initialize Camera UI and connect signaling
      if (window.nexcamCamera) window.nexcamCamera.initUI();
      if (window.nexcamWebRTC) {
        window.nexcamWebRTC.connectSignaling('camera', {
          cameraName: window.nexcamCamera ? window.nexcamCamera.cameraName : 'Camera'
        });
      }
    } else {
      camView.style.display = 'none';
      dispView.style.display = 'flex';
      dispTab.classList.add('active');
      camTab.classList.remove('active');

      // Stop camera if it was streaming locally
      if (window.nexcamCamera && window.nexcamCamera.isStreaming) {
        window.nexcamCamera.stopCamera();
      }

      // Initialize Display UI and connect signaling
      if (window.nexcamDisplay) window.nexcamDisplay.initUI();
      if (window.nexcamWebRTC) {
        window.nexcamWebRTC.connectSignaling('display');
      }
    }
  }

  bindGlobalEvents() {
    // Mode Switcher Tabs
    const camTab = document.getElementById('tab-mode-camera');
    const dispTab = document.getElementById('tab-mode-display');
    if (camTab) camTab.onclick = () => this.switchMode('camera');
    if (dispTab) dispTab.onclick = () => this.switchMode('display');

    // Camera Controls
    const startCamBtn = document.getElementById('camera-start-btn');
    const stopCamBtn = document.getElementById('camera-stop-btn');
    const switchCamBtn = document.getElementById('camera-switch-lens-btn');
    const lockCamBtn = document.getElementById('camera-lock-btn');
    const micCamBtn = document.getElementById('camera-mic-btn');
    const blackScreenBtn = document.getElementById('camera-black-screen-btn');
    const pairCodeCamBtn = document.getElementById('camera-generate-pair-btn');
    const fullScreenCamBtn = document.getElementById('camera-fullscreen-btn');
    const displaysManageBtn = document.getElementById('camera-displays-manage-btn');

    if (startCamBtn) startCamBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.startCamera();
    if (stopCamBtn) stopCamBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.stopCamera();
    if (switchCamBtn) switchCamBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.switchCamera();
    if (lockCamBtn) lockCamBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.toggleCameraLock();
    if (micCamBtn) micCamBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.toggleMicrophone();
    if (blackScreenBtn) blackScreenBtn.onclick = () => window.nexcamCamera && window.nexcamCamera.enableBlackScreenMode();
    if (fullScreenCamBtn) fullScreenCamBtn.onclick = () => this.toggleFullscreen();
    if (pairCodeCamBtn) pairCodeCamBtn.onclick = () => this.openCameraPairingModal();
    if (displaysManageBtn) displaysManageBtn.onclick = () => this.openDisplaysDrawer();

    // Display Controls
    const addCamBtn = document.getElementById('display-add-camera-btn');
    const recordAllBtn = document.getElementById('display-record-toggle-btn');
    const multiLayoutSelect = document.getElementById('multi-layout-selector');

    if (addCamBtn) addCamBtn.onclick = () => this.openDisplayConnectModal();
    if (recordAllBtn) recordAllBtn.onclick = () => window.nexcamDisplay && window.nexcamDisplay.toggleRecordActiveCamera();
    if (multiLayoutSelect) {
      multiLayoutSelect.onchange = (e) => {
        if (window.nexcamLayout) window.nexcamLayout.applyMultiCameraLayout(e.target.value);
      };
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.warn(e));
    } else {
      document.exitFullscreen().catch(e => console.warn(e));
    }
  }

  openCameraPairingModal() {
    const modal = document.getElementById('camera-pairing-modal');
    if (!modal) return;

    // Generate new secure 8-character pairing code
    if (window.nexcamPairing && window.nexcamCamera) {
      const pairInfo = window.nexcamPairing.generatePairingCode();
      const codeEl = document.getElementById('modal-pairing-code-val');
      const qrEl = document.getElementById('modal-pairing-qr-wrap');

      if (codeEl) codeEl.textContent = pairInfo.code;
      if (qrEl) {
        const payload = window.nexcamPairing.createQRPayload(
          window.nexcamSecurity ? window.nexcamSecurity.deviceId : 'CAM-1',
          window.nexcamCamera.cameraName
        );
        qrEl.innerHTML = window.nexcamPairing.generateQRCodeSVG(payload, 220);
      }
    }

    modal.style.display = 'flex';
  }

  openDisplayConnectModal() {
    const modal = document.getElementById('display-pair-modal');
    if (modal) modal.style.display = 'flex';
  }

  openDisplaysDrawer() {
    const modal = document.getElementById('camera-displays-modal');
    if (modal) {
      if (window.nexcamCamera) window.nexcamCamera.updateConnectedDisplaysList();
      modal.style.display = 'flex';
    }
  }

  setupModals() {
    // Close modal on backdrop click
    document.querySelectorAll('.glass-modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Close buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.glass-modal-backdrop');
        if (modal) modal.style.display = 'none';
      });
    });

    // Display Pairing Form
    const submitPairBtn = document.getElementById('btn-submit-pair-code');
    const pairInput = document.getElementById('input-pair-code');
    if (submitPairBtn && pairInput) {
      submitPairBtn.onclick = () => {
        const code = pairInput.value.trim().toUpperCase();
        if (window.nexcamDisplay && window.nexcamDisplay.requestPairing(code)) {
          document.getElementById('display-pair-modal').style.display = 'none';
          pairInput.value = '';
        }
      };
    }
  }

  setupSettingsUI() {
    const settingsBtn = document.getElementById('header-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    if (settingsBtn && settingsModal) {
      settingsBtn.onclick = () => settingsModal.style.display = 'flex';
    }

    // Layout select bindings
    const mobileSel = document.getElementById('setting-mobile-layout');
    const desktopSel = document.getElementById('setting-desktop-layout');
    const fontThemeSel = document.getElementById('setting-font-theme');
    const blackTimeoutSel = document.getElementById('setting-black-timeout');
    const signalingInput = document.getElementById('setting-signaling-url');

    if (mobileSel && window.nexcamLayout) {
      mobileSel.value = window.nexcamLayout.currentMobileLayout;
      mobileSel.onchange = (e) => window.nexcamLayout.applyMobileLayout(e.target.value);
    }

    if (desktopSel && window.nexcamLayout) {
      desktopSel.value = window.nexcamLayout.currentDesktopLayout;
      desktopSel.onchange = (e) => window.nexcamLayout.applyDesktopLayout(e.target.value);
    }

    if (fontThemeSel) {
      fontThemeSel.onchange = (e) => {
        document.body.classList.remove('font-theme-cyber', 'font-theme-minimal');
        if (e.target.value !== 'default') {
          document.body.classList.add(`font-theme-${e.target.value}`);
        }
        localStorage.setItem('nexcam_font_theme', e.target.value);
      };
      const savedTheme = localStorage.getItem('nexcam_font_theme') || 'default';
      fontThemeSel.value = savedTheme;
      if (savedTheme !== 'default') document.body.classList.add(`font-theme-${savedTheme}`);
    }

    if (blackTimeoutSel && window.nexcamCamera) {
      blackTimeoutSel.value = window.nexcamCamera.blackScreenTimeoutSec.toString();
      blackTimeoutSel.onchange = (e) => {
        window.nexcamCamera.blackScreenTimeoutSec = parseInt(e.target.value, 10);
        localStorage.setItem(window.nexcamCamera.STORAGE_KEY_BLACK_TIMEOUT, e.target.value);
        window.nexcamCamera.resetInactivityTimer();
      };
    }

    if (signalingInput && window.nexcamWebRTC) {
      signalingInput.value = window.nexcamWebRTC.signalingUrl;
      signalingInput.onchange = (e) => {
        window.nexcamWebRTC.signalingUrl = e.target.value.trim();
        localStorage.setItem(window.nexcamWebRTC.STORAGE_KEY_SIGNALING_URL, e.target.value.trim());
      };
    }

    // Security logs viewer
    const viewLogsBtn = document.getElementById('btn-view-security-logs');
    if (viewLogsBtn) {
      viewLogsBtn.onclick = () => this.renderSecurityLogs();
    }
  }

  renderSecurityLogs() {
    const listEl = document.getElementById('security-logs-container');
    if (!listEl || !window.nexcamSecurity) return;

    const logs = window.nexcamSecurity.getLogs();
    listEl.innerHTML = '';

    if (logs.length === 0) {
      listEl.innerHTML = `<div style="color:var(--color-text-muted); font-size:11px;">No security incidents recorded.</div>`;
      return;
    }

    logs.forEach(log => {
      const item = document.createElement('div');
      item.style.padding = '6px 8px';
      item.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
      item.style.fontSize = '11px';
      item.style.fontFamily = 'var(--font-mono)';

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; color:var(--accent-cyan);">
          <span>[${log.type}]</span>
          <span style="color:var(--color-text-muted);">${new Date(log.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="color:#ffffff; margin-top:2px;">${log.message}</div>
      `;
      listEl.appendChild(item);
    });
  }

  handleSecurityAlert(alert) {
    if (window.showToast) {
      window.showToast(`Security Check: ${alert.type} on session ${alert.sessionId}`, 'warning');
    }
  }
}

// Global Toast Notification Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type} toast-notification`;

  const iconName = type === 'success' ? 'check' : type === 'error' ? 'close' : type === 'warning' ? 'alertTriangle' : 'info';
  const iconHtml = window.getIcon ? window.getIcon(iconName, 'toast-icon') : '';

  toast.innerHTML = `
    ${iconHtml}
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

window.showToast = showToast;

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.nexcamApp = new NexcamApp();
  window.nexcamApp.init();
});
