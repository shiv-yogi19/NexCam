/**
 * NEXCAM CCTV - Security Engine Unit Tests
 * Created By Shiv Yogi
 */

import assert from 'node:assert';
import NexcamSecurity from '../js/security.js';

export async function runSecurityTests() {
  console.log('\n--- Running Security Engine Tests ---');
  
  // Mock localStorage for Node test runner environment
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };
  }

  const security = new NexcamSecurity();

  // Test 1: Device Identity Initialization
  assert.strictEqual(typeof security.deviceId, 'string');
  assert.strictEqual(security.deviceId.startsWith('NEX-'), true, 'Device ID must have NEX- prefix');
  console.log('✓ PASS: Device ID initialized:', security.deviceId);

  // Test 2: Session Token Generation
  const tokenObj = await security.generateSessionToken('camera', 'Front Gate');
  assert.strictEqual(typeof tokenObj.token, 'string');
  assert.strictEqual(tokenObj.payload.role, 'camera');
  assert.strictEqual(tokenObj.payload.cameraName, 'Front Gate');
  console.log('✓ PASS: Cryptographic session token generation verified');

  // Test 3: Rate Limiting (5 Attempts Window)
  const testId = 'TEST-DEVICE-ATTACKER';
  assert.strictEqual(security.checkRateLimit(testId).allowed, true, 'Initial attempt should be allowed');

  for (let i = 1; i <= 5; i++) {
    security.recordFailedAttempt(testId);
  }

  const blockedCheck = security.checkRateLimit(testId);
  assert.strictEqual(blockedCheck.allowed, false, 'Rate limit should trigger after 5 failures');
  assert.strictEqual(typeof blockedCheck.remainingSeconds, 'number');
  console.log('✓ PASS: Rate limiter blocks after 5 failed attempts (lockout active)');

  // Reset rate limit
  security.resetFailedAttempts(testId);
  assert.strictEqual(security.checkRateLimit(testId).allowed, true, 'Rate limit reset should restore access');
  console.log('✓ PASS: Rate limit reset functionality verified');

  // Test 4: Device Blocking & Revocation
  const maliciousDevice = 'NEX-MALICIOUS-123';
  assert.strictEqual(security.isDeviceBlocked(maliciousDevice), false);
  security.blockDevice(maliciousDevice, 'Testing blocking behavior');
  assert.strictEqual(security.isDeviceBlocked(maliciousDevice), true, 'Device should be blocked');
  console.log('✓ PASS: Device blocking verified');

  security.unblockDevice(maliciousDevice);
  assert.strictEqual(security.isDeviceBlocked(maliciousDevice), false, 'Device should be unblocked');
  console.log('✓ PASS: Device unblocking verified');

  // Test 5: Session Revocation & 15-Second Monitoring
  const sessionId = 'SESS-TEST-999';
  security.registerActiveSession(sessionId, { deviceId: 'NEX-CLIENT-1', deviceName: 'Display' });
  assert.strictEqual(security.activeSessions.has(sessionId), true);

  security.revokeSession(sessionId, 'Security test revocation');
  assert.strictEqual(security.isSessionRevoked(sessionId), true, 'Session should be marked revoked');
  assert.strictEqual(security.activeSessions.has(sessionId), false, 'Session must be pruned from active map');
  console.log('✓ PASS: Session revocation and instant teardown verified');

  // Test 6: Audit Logging
  security.logEvent('AUDIT_TEST', 'Test audit log entry');
  const logs = security.getLogs();
  assert.strictEqual(logs.length > 0, true);
  assert.strictEqual(logs[0].type, 'AUDIT_TEST');
  console.log('✓ PASS: Privacy-conscious security audit logger verified');
}
