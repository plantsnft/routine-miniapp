# Installing ethers.js - Fixed Version

## The Issue

`siwe@3.0.0` requires `ethers@^6.0.8` (minimum version 6.0.8), but we tried to install `6.0.0` which doesn't satisfy that requirement.

## ✅ Solution: Install Compatible Version

I've updated `package.json` to use `ethers@^6.0.8` which is compatible with both:
- `siwe@3.0.0` (requires `^6.0.8`)
- `@farcaster/auth-client@0.3.0` (accepts `5.x || 6.x`)

## Run This Command:

```cmd
cd C:\miniapps\routine\poker
npm install ethers@^6.0.8
```

Or simply install the latest compatible version:

```cmd
npm install ethers@latest
```

## Alternative: Use Legacy Peer Deps (If Still Having Issues)

If you still get conflicts, you can use:

```cmd
npm install ethers@^6.0.8 --legacy-peer-deps
```

This tells npm to use the legacy (more permissive) peer dependency resolution.

---

## What Changed

- Updated `package.json` to use `ethers@^6.0.8` instead of `ethers@^6.0.0`
- This version satisfies the peer dependency requirements

---

## Verify Installation

After installing, verify:

```cmd
npm list ethers
```

You should see something like `ethers@6.x.x` where x.x >= 0.8.

