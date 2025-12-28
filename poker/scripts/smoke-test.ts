/**
 * Production smoke test script
 * 
 * Usage:
 *   Set environment variables:
 *     - BASE_URL (your API URL, e.g., https://your-app.vercel.app)
 *     - AUTH_TOKEN (JWT token from Farcaster Quick Auth)
 *     - TEST_GAME_ID (game ID to test)
 *     - TEST_TX_HASH (transaction hash to verify)
 *     - TEST_FID (FID to check in participants)
 *   
 *   Run: npm run test:smoke
 * 
 * This script performs a quick smoke test of critical payment endpoints
 * to verify the system is working correctly in production.
 */

// Note: dotenv is optional - use environment variables directly
// In Node.js scripts, environment variables are available via process.env

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEST_GAME_ID = process.env.TEST_GAME_ID || '';
const TEST_TX_HASH = process.env.TEST_TX_HASH || '';
const TEST_FID = process.env.TEST_FID ? parseInt(process.env.TEST_FID, 10) : 0;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
  results.push(result);
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${result.name}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  if (result.details) {
    console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
  }
}

async function testHealth() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    
    if (res.ok && data.status === 'ok') {
      logResult({ name: 'Health Check', passed: true });
      return true;
    } else {
      logResult({ name: 'Health Check', passed: false, error: `Unexpected response: ${JSON.stringify(data)}` });
      return false;
    }
  } catch (error: any) {
    logResult({ name: 'Health Check', passed: false, error: error.message });
    return false;
  }
}

async function testPaymentConfirm() {
  if (!TEST_GAME_ID || !TEST_TX_HASH) {
    logResult({ 
      name: 'Payment Confirm', 
      passed: false, 
      error: 'TEST_GAME_ID and TEST_TX_HASH environment variables required' 
    });
    return false;
  }

  if (!AUTH_TOKEN) {
    logResult({ 
      name: 'Payment Confirm', 
      passed: false, 
      error: 'AUTH_TOKEN environment variable required' 
    });
    return false;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/payments/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        gameId: TEST_GAME_ID,
        txHash: TEST_TX_HASH,
      }),
    });

    const data = await res.json();
    
    if (res.ok && data.ok) {
      logResult({ 
        name: 'Payment Confirm', 
        passed: true,
        details: {
          participantId: data.data?.participant?.id,
          hasPassword: !!data.data?.game_password,
        }
      });
      return true;
    } else {
      logResult({ 
        name: 'Payment Confirm', 
        passed: false, 
        error: data.error || `Status: ${res.status}`,
        details: { status: res.status, response: data }
      });
      return false;
    }
  } catch (error: any) {
    logResult({ name: 'Payment Confirm', passed: false, error: error.message });
    return false;
  }
}

async function testParticipants() {
  if (!TEST_GAME_ID || !TEST_FID) {
    logResult({ 
      name: 'Participants Check', 
      passed: false, 
      error: 'TEST_GAME_ID and TEST_FID environment variables required' 
    });
    return false;
  }

  if (!AUTH_TOKEN) {
    logResult({ 
      name: 'Participants Check', 
      passed: false, 
      error: 'AUTH_TOKEN environment variable required' 
    });
    return false;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/games/${TEST_GAME_ID}/participants`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    const data = await res.json();
    
    if (res.ok && data.ok) {
      const participants = data.data || [];
      const userParticipant = participants.find((p: any) => 
        (p.fid === TEST_FID || (p as any).player_fid === TEST_FID)
      );
      
      if (userParticipant) {
        logResult({ 
          name: 'Participants Check', 
          passed: true,
          details: {
            participantId: userParticipant.id,
            status: userParticipant.status,
            txHash: userParticipant.tx_hash,
          }
        });
        return true;
      } else {
        logResult({ 
          name: 'Participants Check', 
          passed: false, 
          error: `No participant found for FID ${TEST_FID}`,
          details: { participantsCount: participants.length }
        });
        return false;
      }
    } else {
      logResult({ 
        name: 'Participants Check', 
        passed: false, 
        error: data.error || `Status: ${res.status}`,
        details: { status: res.status }
      });
      return false;
    }
  } catch (error: any) {
    logResult({ name: 'Participants Check', passed: false, error: error.message });
    return false;
  }
}

async function main() {
  console.log('🚀 Production Smoke Test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Game ID: ${TEST_GAME_ID || '(not set)'}`);
  console.log(`TX Hash: ${TEST_TX_HASH || '(not set)'}`);
  console.log(`FID: ${TEST_FID || '(not set)'}`);
  console.log('');

  if (!BASE_URL) {
    console.error('❌ BASE_URL environment variable is required');
    process.exit(1);
  }

  // Run tests
  const healthPassed = await testHealth();
  const confirmPassed = TEST_GAME_ID && TEST_TX_HASH ? await testPaymentConfirm() : true;
  const participantsPassed = TEST_GAME_ID && TEST_FID ? await testParticipants() : true;

  console.log('');
  console.log('📊 Test Summary');
  console.log('─'.repeat(50));
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
  });
  console.log('─'.repeat(50));

  const allPassed = results.every(r => r.passed);
  if (allPassed) {
    console.log('');
    console.log('✅ All smoke tests PASSED');
    process.exit(0);
  } else {
    console.log('');
    console.log('❌ Some smoke tests FAILED');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

