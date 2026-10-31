/**
 * NEXCAM CCTV - Pairing Engine Unit Tests
 * Created By Shiv Yogi
 */

import assert from 'node:assert';
import NexcamPairing from '../js/pairing.js';

export function runPairingTests() {
  console.log('--- Running Pairing Engine Tests ---');
  const pairing = new NexcamPairing();

  // Test 1: Code Generation Format & Length
  const pairInfo = pairing.generatePairingCode();
  assert.strictEqual(typeof pairInfo.code, 'string', 'Code should be a string');
  assert.strictEqual(pairInfo.code.length, 8, 'Code must be exactly 8 characters');
  console.log('✓ PASS: 8-character code generated:', pairInfo.code);

  // Test 2: Unambiguous Character Set (no 0, O, 1, I)
  const ambiguousChars = ['0', 'O', '1', 'I'];
  for (const ch of ambiguousChars) {
    assert.strictEqual(pairInfo.code.includes(ch), false, `Code must not contain ambiguous character '${ch}'`);
  }
  console.log('✓ PASS: Ambiguous characters (0, O, 1, I) properly excluded');

  // Test 3: Format Validator
  assert.strictEqual(pairing.isValidCodeFormat(pairInfo.code), true, 'Valid code should pass format validation');
  assert.strictEqual(pairing.isValidCodeFormat('SHORT'), false, 'Short code should fail validation');
  assert.strictEqual(pairing.isValidCodeFormat('12345678'), false, 'Code with "1" should fail validation');
  assert.strictEqual(pairing.isValidCodeFormat('ABC0EFGH'), false, 'Code with "0" should fail validation');
  console.log('✓ PASS: Format validator works strictly');

  // Test 4: Incoming Code Matching & Validation
  const validRes = pairing.validateIncomingCode(pairInfo.code);
  assert.strictEqual(validRes.valid, true, 'Matching code must validate successfully');
  
  const invalidRes = pairing.validateIncomingCode('WRONGCOD');
  assert.strictEqual(invalidRes.valid, false, 'Mismatched code must fail');
  assert.strictEqual(invalidRes.reason, 'CODE_MISMATCH');
  console.log('✓ PASS: Exact code validation and mismatch detection working');

  // Test 5: Single-Use Invalidation
  pairing.invalidateCurrentCode();
  const invalidatedRes = pairing.validateIncomingCode(pairInfo.code);
  assert.strictEqual(invalidatedRes.valid, false, 'Invalidated code should be rejected');
  assert.strictEqual(invalidatedRes.reason, 'NO_ACTIVE_CODE');
  console.log('✓ PASS: Single-use code invalidation verified');

  // Test 6: QR Code Payload & SVG Generator
  pairing.generatePairingCode();
  const payloadStr = pairing.createQRPayload('CAM-TEST-1', 'Entrance Camera');
  const parsed = JSON.parse(payloadStr);
  assert.strictEqual(parsed.app, 'NEXCAM');
  assert.strictEqual(parsed.name, 'Entrance Camera');
  assert.strictEqual(typeof parsed.exp, 'number');

  const svgStr = pairing.generateQRCodeSVG(payloadStr, 200);
  assert.strictEqual(svgStr.startsWith('<svg'), true, 'QR generator must produce valid SVG string');
  assert.strictEqual(svgStr.includes('</svg>'), true);
  console.log('✓ PASS: QR code payload and standalone SVG generation verified');
}
