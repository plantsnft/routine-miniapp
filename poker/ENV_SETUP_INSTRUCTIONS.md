# Environment Variables Setup Instructions

## 📍 Where to Create the File

Create the `.env.local` file in the **poker directory**:

```
C:\miniapps\routine\poker\.env.local
```

---

## 📝 How to Create It

### Option 1: Using Notepad (Windows)
1. Open Notepad
2. Copy the contents from `.env.local.example` (see below)
3. Fill in your actual values
4. Save as `.env.local` (make sure "Save as type" is set to "All Files")
5. Location: `C:\miniapps\routine\poker\.env.local`

### Option 2: Using Command Line
```cmd
cd C:\miniapps\routine\poker
copy .env.local.example .env.local
notepad .env.local
```

---

## ✅ Required Variables

### 🔴 Critical (Required for app to work):

1. **Supabase Database** (get from Supabase dashboard → Settings → API):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE=your-service-role-key
   ```

2. **Neynar API**:
   ```env
   NEYNAR_API_KEY=768ACB76-E4C1-488E-9BD7-3BAA76EC0F04
   ```

3. **Base Network Contract** (already set):
   ```env
   NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D
   NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
   ```

4. **Master Wallet Private Key** (⚠️ NEW - REQUIRED for refund/settle):
   ```env
   MASTER_WALLET_PRIVATE_KEY=your-private-key-here
   ```
   This is the private key for wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

---

## 📋 Complete Example File

Here's what your `.env.local` should look like:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Neynar
NEYNAR_API_KEY=768ACB76-E4C1-488E-9BD7-3BAA76EC0F04

# Base Network & Contract (already configured)
NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org

# Master Wallet (for refund/settle - ⚠️ ADD THIS!)
MASTER_WALLET_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

---

## 🔐 Security Notes

### ⚠️ NEVER:
- ❌ Commit `.env.local` to git (it's already in `.gitignore`)
- ❌ Share your private keys publicly
- ❌ Paste private keys in chat/email

### ✅ ALWAYS:
- ✅ Keep `.env.local` local only
- ✅ Use environment variables in Vercel (Settings → Environment Variables)
- ✅ Use different keys for development vs production

---

## 🚀 For Vercel (Production)

You also need to add these same variables in Vercel:

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add each variable from above
4. Make sure `MASTER_WALLET_PRIVATE_KEY` is set for Production environment

---

## ✅ Verify It's Working

After creating `.env.local`, restart your dev server:

```cmd
cd C:\miniapps\routine\poker
npm run dev
```

The app should start without errors. If you see errors about missing environment variables, double-check your `.env.local` file.

---

## 📍 File Location Summary

**Create this file here:**
```
C:\miniapps\routine\poker\.env.local
```

**NOT here** (this is for a different project):
```
C:\miniapps\routine\.env.local
```

The `.env.local` file should be **inside the poker folder**, at the same level as `package.json`.

