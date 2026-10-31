/**
 * NEXCAM CCTV - Layouts Unit Tests
 * Created By Shiv Yogi
 */

import assert from 'node:assert';
import NexcamLayoutManager from '../js/layouts.js';

export function runLayoutTests() {
  console.log('\n--- Running Layout Engine Tests ---');

  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };
  }

  const manager = new NexcamLayoutManager();

  // Test 1: Verify exactly 8 Multi-Camera Layouts exist
  assert.strictEqual(manager.MULTI_LAYOUTS.length, 8, 'Must provide exactly 8 multi-camera layouts');
  const expectedLayoutIds = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'];
  expectedLayoutIds.forEach(id => {
    const found = manager.MULTI_LAYOUTS.find(l => l.id === id);
    assert.strictEqual(!!found, true, `Layout ${id} must exist`);
  });
  console.log('✓ PASS: All 8 Multi-Camera layouts (L1 - L8) registered properly');

  // Test 2: Verify exactly 3 Mobile Layouts exist
  assert.strictEqual(manager.MOBILE_LAYOUTS.length, 3, 'Must provide exactly 3 mobile layouts');
  const expectedMobileIds = ['m1', 'm2', 'm3'];
  expectedMobileIds.forEach(id => {
    const found = manager.MOBILE_LAYOUTS.find(l => l.id === id);
    assert.strictEqual(!!found, true, `Mobile Layout ${id} must exist`);
  });
  console.log('✓ PASS: All 3 Mobile layouts (M1 - M3) registered properly');

  // Test 3: Verify exactly 3 Desktop Layouts exist
  assert.strictEqual(manager.DESKTOP_LAYOUTS.length, 3, 'Must provide exactly 3 desktop layouts');
  const expectedDesktopIds = ['d1', 'd2', 'd3'];
  expectedDesktopIds.forEach(id => {
    const found = manager.DESKTOP_LAYOUTS.find(l => l.id === id);
    assert.strictEqual(!!found, true, `Desktop Layout ${id} must exist`);
  });
  console.log('✓ PASS: All 3 Desktop layouts (D1 - D3) registered properly');

  // Test 4: Focus Camera State
  manager.setFocusedCamera('PEER-CAM-FOCUS');
  assert.strictEqual(manager.focusedCameraId, 'PEER-CAM-FOCUS');
  console.log('✓ PASS: Focus camera state tracked');
}
