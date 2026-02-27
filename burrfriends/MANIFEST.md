# Farcaster Mini App Manifest Configuration

## Overview

The Farcaster mini app manifest is served at `/.well-known/farcaster.json` and defines how the mini app appears in Farcaster clients.

## File Location

- **Route Handler**: `src/app/.well-known/farcaster.json/route.ts`
- **Manifest Generator**: `src/lib/utils.ts` → `getFarcasterDomainManifest()`
- **Icon Asset**: `public/icon.png`

## Icon Requirements

The `icon.png` file must meet these specifications:

- **Dimensions**: 1024x1024 pixels (square)
- **Format**: PNG
- **Alpha Channel**: No alpha channel (no transparency)
- **Location**: `public/icon.png`
- **Served At**: `https://poker-swart.vercel.app/icon.png`

### Creating the Icon

1. Create or resize your logo to exactly 1024x1024 pixels
2. Ensure it's a PNG file
3. Remove any alpha/transparency channel
4. Save as `public/icon.png`

You can use image editing tools like:
- ImageMagick: `convert input.png -background white -alpha remove -resize 1024x1024 icon.png`
- Photoshop/GIMP: Export as PNG with transparency disabled
- Online tools: Resize and remove transparency

## Manifest Structure

The manifest includes only **safe fields** that we can guarantee meet constraints:

### Required Fields
- `version`: "1" (always)
- `name`: App name (from `APP_NAME` env var or default: "Poker Lobby")
- `homeUrl`: App home URL (from `NEXT_PUBLIC_BASE_URL` or request host)
- `iconUrl`: URL to icon.png (`{homeUrl}/icon.png`)

### Safe Optional Fields
These are only included if environment variables are set:
- `subtitle`: Short subtitle (from `APP_SUBTITLE`)
- `description`: App description (from `APP_DESCRIPTION`)
- `primaryCategory`: Primary category (from `APP_PRIMARY_CATEGORY`)
- `tags`: Array of tags (from `APP_TAGS` JSON string)
- `tagline`: Short tagline (from `APP_TAGLINE`)
- `ogTitle`: Open Graph title (from `APP_OG_TITLE`)
- `ogDescription`: Open Graph description (from `APP_OG_DESCRIPTION`)
- `noindex`: Boolean to prevent indexing (from `APP_NOINDEX=true`)
- `buttonTitle`: Launch button text (from `APP_BUTTON_TEXT`)
- `webhookUrl`: Webhook URL for events (from `APP_WEBHOOK_URL`)

### Excluded Fields (Image Dimension Constraints)

These fields are **omitted** until we add correctly-sized assets:

- ❌ `splashImageUrl` - Requires 200x200 pixels
- ❌ `ogImageUrl` - Requires 1200x630 PNG
- ❌ `imageUrl` - Deprecated, expects 3:2 aspect ratio
- ❌ `screenshotUrls` - Requires 1284x2778 screenshots array

## Backward Compatibility

The manifest includes both `miniapp` and `frame` objects with identical content for backward compatibility with older Farcaster clients.

## Environment Variables

Set these in Vercel (or `.env.local` for local development):

```bash
# Required - base URL for production
NEXT_PUBLIC_BASE_URL=https://poker-swart.vercel.app

# Optional - app metadata
APP_NAME=Poker Lobby
APP_DESCRIPTION=Play poker games on Farcaster
APP_SUBTITLE=Join poker games
APP_TAGLINE=Your poker room on Farcaster
APP_PRIMARY_CATEGORY=games
APP_TAGS=["poker","gaming","social"]
APP_OG_TITLE=Poker Lobby - Play Poker on Farcaster
APP_OG_DESCRIPTION=Join poker games and tournaments on Farcaster
APP_BUTTON_TEXT=Launch Mini App
APP_WEBHOOK_URL=https://api.neynar.com/f/app/{CLIENT_ID}/event

# Account association (for signed manifests)
NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION={"header":"...","payload":"...","signature":"..."}
```

## Verification

After deployment, verify the manifest:

1. **Check manifest URL**:
   ```
   https://poker-swart.vercel.app/.well-known/farcaster.json
   ```
   - Should return 200 OK
   - Content-Type: application/json
   - Should include `miniapp` and `frame` objects
   - All image URLs should use absolute URLs

2. **Check icon URL**:
   ```
   https://poker-swart.vercel.app/icon.png
   ```
   - Should return 200 OK
   - Content-Type: image/png
   - Should be 1024x1024 PNG with no alpha channel

## Troubleshooting

- **Manifest not found**: Ensure `src/app/.well-known/farcaster.json/route.ts` exists
- **Icon not loading**: Verify `public/icon.png` exists and is committed
- **Type errors**: Ensure `icon.png` meets dimension requirements (1024x1024)
- **Wrong domain in URLs**: Set `NEXT_PUBLIC_BASE_URL` environment variable


