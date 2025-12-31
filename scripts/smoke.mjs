/**
 * Lightweight smoke test for Catwalk Mini-App
 * Tests stable endpoints that don't require auth/wallet state
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const tests = [
  {
    name: 'Farcaster Manifest',
    path: '/.well-known/farcaster.json',
    validate: (data) => {
      if (!data || typeof data !== 'object') {
        throw new Error('Response must be an object');
      }
      if (!data.accountAssociation) {
        throw new Error('Missing accountAssociation');
      }
      if (!data.miniapp) {
        throw new Error('Missing miniapp');
      }
      if (!data.miniapp.name || !data.miniapp.homeUrl) {
        throw new Error('miniapp missing required fields (name, homeUrl)');
      }
    },
  },
  {
    name: 'Token Price',
    path: '/api/token-price',
  },
  {
    name: 'Channel Feed',
    path: '/api/channel-feed',
  },
  {
    name: 'Channel Stats',
    path: '/api/channel-stats',
  },
  {
    name: 'Users',
    path: '/api/users',
  },
];

async function runTest(test) {
  const url = `${BASE_URL}${test.path}`;
  try {
    const response = await fetch(url, {
      method: test.method || 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`❌ FAIL: ${test.name} - HTTP ${response.status} ${response.statusText}`);
      return false;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log(`❌ FAIL: ${test.name} - Expected JSON, got ${contentType}`);
      return false;
    }

    const data = await response.json();

    // Run custom validation if provided
    if (test.validate) {
      try {
        test.validate(data);
      } catch (error) {
        console.log(`❌ FAIL: ${test.name} - Validation error: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }

    console.log(`✅ PASS: ${test.name}`);
    return true;
  } catch (error) {
    console.log(`❌ FAIL: ${test.name} - ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  console.log(`\n🧪 Running smoke tests against: ${BASE_URL}\n`);

  const results = await Promise.all(tests.map(runTest));
  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed\n`);

  if (passed === total) {
    console.log('✅ All smoke tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some smoke tests failed');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

