# How to Check Browser Console for Debugging

## Desktop (Chrome/Edge/Firefox)

1. **Open the mini app in Farcaster on desktop**
2. **Right-click anywhere on the page** → Select **"Inspect"** or **"Inspect Element"**
3. **Click the "Console" tab** at the top of the developer tools
4. **Look for messages starting with `[TokenTicker]`** or `[Token Price]` or `[Recent Purchases]`
5. **Copy any errors or log messages** and share them

## Mobile (iPhone/Android)

### iPhone (Safari):
1. **Enable Developer Menu:**
   - Go to Settings → Safari → Advanced → Enable "Web Inspector"
2. **Connect iPhone to Mac via USB**
3. **On Mac:** Open Safari → Develop menu → Select your iPhone → Select the Farcaster page
4. **Console will open on Mac** showing mobile Safari console

### Android (Chrome):
1. **Enable USB Debugging** on your phone (Settings → Developer Options)
2. **Connect to computer via USB**
3. **On computer:** Open Chrome → Go to `chrome://inspect`
4. **Click "Inspect"** next to the Farcaster page
5. **Console will open** showing mobile Chrome console

### Alternative - Mobile Browser (easier):
1. **Open the mini app URL directly in mobile browser** (not in Farcaster app)
2. **On mobile browser, you can usually access console:**
   - Chrome Mobile: Menu → More Tools → Developer Tools
   - Or use a remote debugging tool

## What to Look For:

Look for these log messages:
- `[TokenTicker] Fetching token data...`
- `[TokenTicker] Price data received:` - Shows what data came back
- `[Token Price] DexScreener success:` - Shows API response
- Any messages with `Error` or `Failed`

## Quick Test - Desktop Browser:

1. **Open the deployed site directly in a browser** (not in Farcaster):
   - Go to: `https://catwalk-smoky.vercel.app`
2. **Open Console** (F12 or Right-click → Inspect → Console)
3. **Check the logs** - you should see `[TokenTicker]` messages
4. **Share what you see!**

