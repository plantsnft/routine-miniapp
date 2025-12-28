# Post-Deploy Verification Checklist: Farcaster Mini App Store Discovery

## Prerequisites

Before running this checklist, ensure you have:

1. ✅ Set environment variables in Vercel (see "Environment Variables" section below)
2. ✅ Generated domain association in Farcaster Developer Tools (if not already done)
3. ✅ Deployed latest code to Vercel

## Environment Variables (Vercel)

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

### Required for Domain Validation

**Option A: Separate env vars (recommended for clarity)**
```
FARCASTER_ASSOC_HEADER=<base64-encoded header>
FARCASTER_ASSOC_PAYLOAD=<base64-encoded payload>
FARCASTER_ASSOC_SIGNATURE=<signature string>
```

**Option B: Single JSON env var (alternative)**
```
NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION={"header":"...","payload":"...","signature":"..."}
```

### Recommended Additional Variables
```
NEXT_PUBLIC_BASE_URL=https://poker-swart.vercel.app
APP_NAME=Poker Lobby
APP_DESCRIPTION=Play poker games on Farcaster
```

## Step 1: Get Domain Association from Farcaster (One-Time Setup)

If you haven't generated the domain association yet:

1. Open **Warpcast** app (or Farcaster web)
2. Go to **Developer Tools** (usually in Settings or Profile menu)
3. Navigate to **Domains** section
4. Click **Add Domain** or **Generate Association** for `poker-swart.vercel.app`
5. Copy the three values:
   - `header` (base64 string)
   - `payload` (base64 string)
   - `signature` (string)
6. Paste into Vercel env vars (see above)

**Note**: The `payload` decodes to JSON like `{"domain":"poker-swart.vercel.app"}`. Verify it matches your deployed domain.

## Step 2: Verify Diagnostics Endpoint

Open in browser: `https://poker-swart.vercel.app/api/debug/farcaster-manifest`

✅ **Expected output**:
```json
{
  "request": {
    "host": "poker-swart.vercel.app",
    "baseUrl": "https://poker-swart.vercel.app",
    "expectedDomain": "poker-swart.vercel.app"
  },
  "accountAssociation": {
    "source": "FARCASTER_ASSOC_* (separate vars)",
    "payloadDomain": "poker-swart.vercel.app",
    "domainMatch": true,
    ...
  },
  "validation": {
    "domainMatch": true,
    "status": "✅ PASS",
    "message": "Domain matches: poker-swart.vercel.app"
  }
}
```

✅ **Expected**: `validation.domainMatch: true` and `status: "✅ PASS"`

❌ **If mismatch**: `validation.domainMatch: false` and `status: "❌ FAIL"` with clear error message

## Step 3: Verify Icon Accessibility

Open: `https://poker-swart.vercel.app/icon.png`

✅ **Expected**: 
- Status 200 OK
- Content-Type: `image/png`
- Image loads correctly (1024x1024 PNG)

## Step 4: Verify Manifest Endpoint

Open: `https://poker-swart.vercel.app/.well-known/farcaster.json`

✅ **Expected**:
- Status 200 OK (NOT 500)
- Content-Type: `application/json`
- JSON includes:
  - `accountAssociation` object with `header`, `payload`, `signature`
  - `miniapp` object with `name: "Poker Lobby"`, `homeUrl`, `iconUrl`
  - `frame` object (backward compatibility)

✅ **If domain mismatch**:
- Status 500
- Error message: `"Domain association mismatch: expected "poker-swart.vercel.app" but payload contains "..."`

## Step 5: Test Store Discovery (After Manifest is Correct)

1. Open Farcaster app (Warpcast) on mobile (different account/device)
2. Go to **Mini App Store** (search icon or menu)
3. Search for "Poker Lobby" or "poker"
4. ✅ App should appear in search results
5. Click to open the mini app

## Troubleshooting

### If diagnostics endpoint shows domain mismatch:
- Verify env vars are set correctly in Vercel
- Double-check the domain in the payload matches `poker-swart.vercel.app`
- Regenerate domain association in Farcaster Developer Tools if needed

### If manifest returns 500:
- Check Vercel logs for the exact error message
- Verify all three env vars (`FARCASTER_ASSOC_HEADER`, `FARCASTER_ASSOC_PAYLOAD`, `FARCASTER_ASSOC_SIGNATURE`) are set
- Ensure the payload domain matches the deployed domain

### If app doesn't appear in store:
- Wait a few minutes for Farcaster to index the manifest
- Verify manifest is accessible and returns 200
- Check that `accountAssociation` is valid and signed correctly
- Ensure `name` field is set and searchable

