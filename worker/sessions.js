/**
 * Cloudflare Worker - Session Management & Revocation List
 * Created By Shiv Yogi
 */

export class SessionCoordinator {
  constructor() {
    this.sessions = new Map(); // sessionId -> { peerId, role, createdAt, lastHeartbeat }
    this.revokedList = new Set();
  }

  createSession(sessionId, meta) {
    this.sessions.set(sessionId, {
      ...meta,
      createdAt: Date.now(),
      lastHeartbeat: Date.now()
    });
  }

  touchSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.lastHeartbeat = Date.now();
    }
  }

  revokeSession(sessionId) {
    this.revokedList.add(sessionId);
    this.sessions.delete(sessionId);
  }

  isRevoked(sessionId) {
    return this.revokedList.has(sessionId);
  }
}
