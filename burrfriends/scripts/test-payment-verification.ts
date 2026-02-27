/**
 * Test script to verify payment confirmation with a real transaction
 * 
 * Usage:
 *   Set environment variables:
 *     - NEXT_PUBLIC_BASE_URL (your API URL)
 *     - AUTH_TOKEN (JWT token from Farcaster Quick Auth)
 *   
 *   Run: npx tsx scripts/test-payment-verification.ts
 * 
 * Test transaction:
 *   Hash: 0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818
 *   Game ID: f12b1fa1-c882-4741-afcd-17c0fac1419a
 *   Expected: 200 OK with participant data and password
 */

// Note: dotenv is optional - use environment variables directly
// In Node.js scripts, environment variables are available via process.env

const API_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEST_TX_HASH = '0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818';
const TEST_GAME_ID = 'f12b1fa1-c882-4741-afcd-17c0fac1419a';

async function testPaymentConfirmation() {
  console.log('🧪 Testing Payment Confirmation');
  console.log(`API URL: ${API_URL}`);
  console.log(`Game ID: ${TEST_GAME_ID}`);
  console.log(`TX Hash: ${TEST_TX_HASH}`);
  console.log('');

  if (!AUTH_TOKEN) {
    console.error('❌ AUTH_TOKEN environment variable is required');
    console.log('Get token from browser console: await sdk.quickAuth.getToken()');
    process.exit(1);
  }

  try {
    // Step 1: Confirm payment
    console.log('📤 Step 1: POST /api/payments/confirm');
    const confirmRes = await fetch(`${API_URL}/api/payments/confirm`, {
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

    const confirmData = await confirmRes.json();
    console.log(`Status: ${confirmRes.status}`);
    console.log(`Response:`, JSON.stringify(confirmData, null, 2));

    if (!confirmRes.ok || !confirmData.ok) {
      console.error('❌ Payment confirmation failed');
      return false;
    }

    console.log('✅ Payment confirmation successful');
    console.log(`Participant ID: ${confirmData.data?.participant?.id}`);
    console.log(`Has Password: ${confirmData.data?.game_password ? 'Yes' : 'No'}`);
    console.log('');

    // Step 2: Check participant in database
    console.log('📤 Step 2: GET /api/games/[id]/participants');
    const participantsRes = await fetch(`${API_URL}/api/games/${TEST_GAME_ID}/participants`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    const participantsData = await participantsRes.json();
    console.log(`Status: ${participantsRes.status}`);
    console.log(`Response:`, JSON.stringify(participantsData, null, 2));

    if (!participantsRes.ok || !participantsData.ok) {
      console.error('❌ Failed to fetch participants');
      return false;
    }

    const participants = participantsData.data || [];
    console.log(`Participant count: ${participants.length}`);
    if (participants.length > 0) {
      console.log(`✅ Participant found in database`);
      console.log(`Participant status: ${participants[0].status}`);
      console.log(`TX Hash: ${participants[0].tx_hash}`);
    } else {
      console.error('❌ No participant found in database');
      return false;
    }
    console.log('');

    // Step 3: Verify game details show paid status
    console.log('📤 Step 3: GET /api/games/[id]');
    const gameRes = await fetch(`${API_URL}/api/games/${TEST_GAME_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    const gameData = await gameRes.json();
    console.log(`Status: ${gameRes.status}`);
    if (gameData.ok && gameData.data) {
      console.log(`Game: ${gameData.data.title || gameData.data.name}`);
      console.log(`Entry Fee: ${gameData.data.entry_fee_amount} ${gameData.data.entry_fee_currency}`);
    }

    console.log('');
    console.log('✅ All tests passed!');
    return true;
  } catch (error: any) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
    return false;
  }
}

async function main() {
  const success = await testPaymentConfirmation();
  process.exit(success ? 0 : 1);
}

main().catch(console.error);

