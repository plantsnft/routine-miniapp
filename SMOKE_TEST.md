# Smoke Test & QA Checklist

## Quick Start

### Running Locally

**Terminal A** (start the server):
```bash
npm run build
npm run start
```

**Terminal B** (run smoke tests):
```bash
npm run smoke
```

### Running Against Production

```bash
BASE_URL=https://your-deployment-url.vercel.app npm run smoke
```

Or use the convenience script (BASE_URL is read from environment):
```bash
BASE_URL=https://your-deployment-url.vercel.app npm run smoke:prod
```

## Smoke Test Coverage

The smoke test (`scripts/smoke.mjs`) validates these stable endpoints:

1. **`/.well-known/farcaster.json`** - Farcaster domain manifest
   - Validates JSON structure
   - Ensures `accountAssociation` and `miniapp` keys exist
   - Checks required `miniapp` fields (name, homeUrl)

2. **`/api/token-price`** - Token price endpoint
   - Validates JSON response

3. **`/api/channel-feed`** - Channel feed endpoint
   - Validates JSON response

4. **`/api/channel-stats`** - Channel statistics endpoint
   - Validates JSON response

5. **`/api/users`** - Users endpoint
   - Validates JSON response

### Excluded Endpoints

The following endpoints are **intentionally excluded** from smoke tests because they:
- Require wallet/signer state (`/api/checkin/reward`, reward claim flows)
- Trigger side effects during build-time static generation
- Require authentication headers to succeed reliably

## Manual QA Checklist

After smoke tests pass, perform these manual checks against your deployment:

### ✅ Core Functionality

- [ ] **Home page loads** - Visit `BASE_URL/` and verify the app renders
- [ ] **Farcaster manifest valid** - Visit `BASE_URL/.well-known/farcaster.json`
  - Should return valid JSON with `accountAssociation` and `miniapp` keys
  - `miniapp.name` should match your app name
  - URLs in manifest should be absolute and correct
- [ ] **Token price endpoint works** - Visit `BASE_URL/api/token-price`
  - Should return JSON (may include price data or empty array)

### ✅ API Endpoints (if applicable)

- [ ] **Channel feed loads** - Verify `/api/channel-feed` returns JSON
- [ ] **Channel stats accessible** - Verify `/api/channel-stats` returns JSON
- [ ] **Users endpoint responds** - Verify `/api/users` returns JSON
- [ ] **Portal page loads** - Visit `/portal` and verify the Creator Portal UI renders
  - Buttons should be clickable (Verify/Claim)
  - API calls should work (requires signed-in user in production)

### ✅ Farcaster Integration

- [ ] **Mini-app opens in Warpcast** - Use Warpcast Mini-App Preview with your URL
- [ ] **SIWN works** - Sign in with Farcaster flow completes successfully
- [ ] **Home tab renders** - App navigation and UI elements display correctly

### ✅ Deployment Health

- [ ] **No build errors in Vercel logs** - Check deployment logs for warnings/errors
- [ ] **Environment variables set** - Verify required env vars are present in Vercel
- [ ] **Static routes generate** - Verify Next.js static generation completes

## Regression Baseline

**Known Good Commit**: `32506b6` (Nov 12 baseline)

When testing for regressions, compare behavior against this baseline. The smoke test helps catch API contract changes early without requiring full integration tests.

## Notes

- Smoke tests use `fetch` API (available in Node.js 18+)
- Tests run in parallel for speed
- Exit code 0 = all passed, exit code 1 = some failed
- No external test framework dependencies (pure Node.js ES modules - `.mjs`)


