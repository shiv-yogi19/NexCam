/**
 * NEXCAM CCTV - Automated Test Suite Runner
 * Created By Shiv Yogi
 */

import { runPairingTests } from './pairing.test.js';
import { runSecurityTests } from './security.test.js';
import { runLayoutTests } from './layouts.test.js';

async function runAllTests() {
  console.log('===========================================================');
  console.log('  NEXCAM CCTV - AUTOMATED SYSTEM VERIFICATION');
  console.log('  Created By Shiv Yogi');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    runPairingTests();
    passed++;
  } catch (err) {
    console.error('✗ FAIL in Pairing Tests:', err);
    failed++;
  }

  try {
    await runSecurityTests();
    passed++;
  } catch (err) {
    console.error('✗ FAIL in Security Tests:', err);
    failed++;
  }

  try {
    runLayoutTests();
    passed++;
  } catch (err) {
    console.error('✗ FAIL in Layout Tests:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  TEST RESULTS: ${passed} SUITES PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('  All core system tests PASSED successfully!\n');
  }
}

runAllTests();
