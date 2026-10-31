/**
 * NEXCAM CCTV - Security Engine & Session Validation
 * Created By Shiv Yogi
 */

class NexcamSecurity {
  constructor() {
    this.STORAGE_KEY_DEVICE_ID = 'nexcam_device_id';
    this.STORAGE_KEY_BLOCKED = 'nexcam_blocked_devices';
    this.STORAGE_KEY_REVOKED = 'nexcam_revoked_tokens';
    this.STORAGE_KEY_LOGS = 'nexcam_security_logs';

    this.deviceId = this.initDeviceId();
    this.blockedDevices = this.loadJSON(this.STORAGE_KEY_BLOCKED, []);
    this.revokedTokens = this.loadJSON(this.STORAGE_KEY_REVOKED, []);
    this.securityLogs = this.loadJSON(this.STORAGE_KEY_LOGS, []);
    
    // Pairing rate limiter: 5 attempts per 5 minutes
    this.failedAttempts = new Map(); // ip_or_id -> { count, firstAttempt }
    this.RATE_LIMIT_MAX = 5;
    this.RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

    // 15-Second Periodic Security Check
    this.monitorInterval = null;
    this.activeSessions = new Map(); // sessionId -> { deviceId, role, createdAt, lastHeartbeat, token }
  }

  initDeviceId() {
    let id = localStorage.getItem(this.STORAGE_KEY_DEVICE_ID);
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = 'NEX-' + crypto.randomUUID();
      } else {
        id = 'NEX-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
      }
      localStorage.setItem(this.STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
  }

  loadJSON(key, defaultVal) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage quota exceeded for key', key);
    }
  }

  // Generate cryptographically signed or hashed session token
  async generateSessionToken(role, cameraName) {
    const payload = {
      deviceId: this.deviceId,
      role: role,
      cameraName: cameraName || 'Camera',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2)
    };
    const jsonStr = JSON.stringify(payload);
    
    // Compute SHA-256 digest using Web Crypto API
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(jsonStr);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return { token: `${btoa(jsonStr)}.${hashHex}`, payload };
    } else {
      return { token: `${btoa(jsonStr)}.fallback`, payload };
    }
  }

  // Rate Limiting
  checkRateLimit(identifier) {
    const now = Date.now();
    const entry = this.failedAttempts.get(identifier);
    if (!entry) return { allowed: true };

    if (now - entry.firstAttempt > this.RATE_LIMIT_WINDOW_MS) {
      this.failedAttempts.delete(identifier);
      return { allowed: true };
    }

    if (entry.count >= this.RATE_LIMIT_MAX) {
      const remainingSeconds = Math.ceil((this.RATE_LIMIT_WINDOW_MS - (now - entry.firstAttempt)) / 1000);
      this.logEvent('RATE_LIMIT_BLOCKED', `Identifier ${identifier} exceeded failed attempts. Locked for ${remainingSeconds}s.`);
      return { allowed: false, remainingSeconds };
    }

    return { allowed: true };
  }

  recordFailedAttempt(identifier) {
    const now = Date.now();
    const entry = this.failedAttempts.get(identifier) || { count: 0, firstAttempt: now };
    entry.count += 1;
    this.failedAttempts.set(identifier, entry);
    this.logEvent('AUTH_FAILURE', `Failed attempt recorded for ${identifier}. Count: ${entry.count}`);
  }

  resetFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  // Blocking System
  isDeviceBlocked(targetDeviceId) {
    return this.blockedDevices.includes(targetDeviceId);
  }

  blockDevice(targetDeviceId, reason = 'User initiated block') {
    if (!this.blockedDevices.includes(targetDeviceId)) {
      this.blockedDevices.push(targetDeviceId);
      this.saveJSON(this.STORAGE_KEY_BLOCKED, this.blockedDevices);
      this.logEvent('DEVICE_BLOCKED', `Device ${targetDeviceId} blocked: ${reason}`);
      this.revokeDeviceSessions(targetDeviceId);
    }
  }

  unblockDevice(targetDeviceId) {
    this.blockedDevices = this.blockedDevices.filter(id => id !== targetDeviceId);
    this.saveJSON(this.STORAGE_KEY_BLOCKED, this.blockedDevices);
    this.logEvent('DEVICE_UNBLOCKED', `Device ${targetDeviceId} unblocked.`);
  }

  // Revocation
  revokeSession(sessionId, reason = 'Session revoked') {
    if (!this.revokedTokens.includes(sessionId)) {
      this.revokedTokens.push(sessionId);
      if (this.revokedTokens.length > 200) this.revokedTokens.shift();
      this.saveJSON(this.STORAGE_KEY_REVOKED, this.revokedTokens);
    }
    this.activeSessions.delete(sessionId);
    this.logEvent('SESSION_REVOKED', `Session ${sessionId} revoked: ${reason}`);
  }

  revokeDeviceSessions(targetDeviceId) {
    for (const [sId, sess] of this.activeSessions.entries()) {
      if (sess.deviceId === targetDeviceId) {
        this.revokeSession(sId, 'Device blocked');
      }
    }
  }

  isSessionRevoked(sessionId) {
    return this.revokedTokens.includes(sessionId);
  }

  registerActiveSession(sessionId, meta) {
    this.activeSessions.set(sessionId, {
      ...meta,
      createdAt: Date.now(),
      lastHeartbeat: Date.now()
    });
    this.logEvent('SESSION_ESTABLISHED', `Session ${sessionId} connected for ${meta.deviceName || meta.deviceId}`);
  }

  updateSessionHeartbeat(sessionId) {
    const sess = this.activeSessions.get(sessionId);
    if (sess) {
      sess.lastHeartbeat = Date.now();
    }
  }

  // 15-Second Periodic Security Check (Section 18)
  startSecurityMonitoring(onAlertCallback) {
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    
    this.monitorInterval = setInterval(() => {
      this.performSecurityCheck(onAlertCallback);
    }, 15000);

    this.logEvent('SECURITY_MONITOR', '15-second periodic security monitoring initialized.');
  }

  performSecurityCheck(onAlertCallback) {
    const now = Date.now();
    const staleThreshold = 45000; // 45 seconds without heartbeat

    for (const [sessionId, session] of this.activeSessions.entries()) {
      // 1. Check if token or session was revoked
      if (this.isSessionRevoked(sessionId)) {
        this.logEvent('SUSPICIOUS_ACTIVITY', `Revoked session ${sessionId} still active. Forcing termination.`);
        if (onAlertCallback) onAlertCallback({ type: 'REVOKED_SESSION', sessionId });
        this.activeSessions.delete(sessionId);
        continue;
      }

      // 2. Check if device is blocked
      if (this.isDeviceBlocked(session.deviceId)) {
        this.logEvent('BLOCKED_DEVICE_DETECTED', `Blocked device ${session.deviceId} detected in session ${sessionId}. Terminating.`);
        if (onAlertCallback) onAlertCallback({ type: 'BLOCKED_DEVICE', sessionId, deviceId: session.deviceId });
        this.activeSessions.delete(sessionId);
        continue;
      }

      // 3. Check for stale / dead session heartbeat
      if (now - session.lastHeartbeat > staleThreshold) {
        this.logEvent('HEARTBEAT_TIMEOUT', `Session ${sessionId} missed heartbeats for ${Math.round((now - session.lastHeartbeat) / 1000)}s.`);
        if (onAlertCallback) onAlertCallback({ type: 'HEARTBEAT_TIMEOUT', sessionId });
      }
    }
  }

  stopSecurityMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // Privacy-Conscious Logging
  logEvent(type, message) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      type,
      message,
      timestamp: new Date().toISOString()
    };
    this.securityLogs.unshift(entry);
    if (this.securityLogs.length > 100) this.securityLogs.pop();
    this.saveJSON(this.STORAGE_KEY_LOGS, this.securityLogs);

    // Dispatch event for UI logs viewer
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexcam-security-log', { detail: entry }));
    }
  }

  getLogs() {
    return this.securityLogs;
  }

  clearLogs() {
    this.securityLogs = [];
    this.saveJSON(this.STORAGE_KEY_LOGS, []);
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamSecurity = new NexcamSecurity();
}

export default NexcamSecurity;
export { NexcamSecurity };

