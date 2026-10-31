/**
 * Cloudflare Worker - Pairing Coordinator
 * Created By Shiv Yogi
 */

export class PairingCoordinator {
  constructor() {
    this.codes = new Map(); // code -> { cameraId, expiresAt, nonce, singleUse: true }
    this.rateLimits = new Map(); // ip -> { count, firstSeen }
    this.MAX_ATTEMPTS = 5;
    this.WINDOW_MS = 5 * 60 * 1000;
  }

  registerCode(code, cameraId, ttlSeconds = 300) {
    const cleanCode = code.trim().toUpperCase();
    this.codes.set(cleanCode, {
      cameraId,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      nonce: Math.random().toString(36).substring(2)
    });
  }

  validateAndConsumeCode(code, clientIp) {
    // Check Rate Limiting
    const now = Date.now();
    const rate = this.rateLimits.get(clientIp) || { count: 0, firstSeen: now };
    if (now - rate.firstSeen > this.WINDOW_MS) {
      rate.count = 0;
      rate.firstSeen = now;
    }

    if (rate.count >= this.MAX_ATTEMPTS) {
      return { valid: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const cleanCode = (code || '').trim().toUpperCase();
    const entry = this.codes.get(cleanCode);

    if (!entry) {
      rate.count += 1;
      this.rateLimits.set(clientIp, rate);
      return { valid: false, error: 'INVALID_CODE' };
    }

    if (now > entry.expiresAt) {
      this.codes.delete(cleanCode);
      return { valid: false, error: 'EXPIRED_CODE' };
    }

    // Invalidate code upon successful use (Single Use)
    this.codes.delete(cleanCode);
    return { valid: true, cameraId: entry.cameraId };
  }
}
