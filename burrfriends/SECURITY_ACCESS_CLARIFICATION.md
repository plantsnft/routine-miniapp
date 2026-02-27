# ⚠️ IMPORTANT: Who Can Access Wallet Private Key

## Current Reality

### Who CAN See the Private Key:

1. **Vercel Account Owner/Admin** 🔴
   - Anyone with owner/admin access to your Vercel project
   - Can view all environment variables in Settings
   - **The private key is visible in plain text**

2. **Vercel Team Members** 🔴
   - Anyone you add as a team member to the Vercel project
   - With appropriate permissions, can view environment variables
   - **The private key is visible in plain text**

3. **Local Developer** 🟡
   - Anyone with access to your local machine
   - Anyone who can read `.env.local` file
   - **The private key is visible in plain text**

4. **Server Logs** 🔴
   - If errors occur, private key might be logged (if code logs `process.env`)
   - Monitoring services might capture environment variables
   - **Risk if not properly secured**

---

## ⚠️ Who CANNOT See It:

1. **FID 318447** ❌ **DOES NOT control key access**
   - FID 318447 is just an identifier for app-level permissions
   - It's used to check "is this user an admin?" in the app
   - **It has NO relationship to who can see the private key**

2. **App Users** ✅
   - Regular users cannot see the key
   - The key is never sent to the client/browser
   - Only used server-side

3. **Git Repository** ✅
   - Key is NOT in git (`.env.local` is git-ignored)

---

## 🔴 The Problem

**Current Setup**: Private key is in Vercel environment variables
- **Anyone with Vercel project access can see it**
- FID 318447 is just for app permissions, not key access
- No connection between "who can use the app as admin" and "who can see the key"

---

## ✅ Solutions to Restrict Access

### Option 1: Single Vercel Account (Simplest)
**If you're the only one who should have the key:**
- Don't add anyone else to your Vercel project
- Only you (account owner) can see environment variables
- **Limitation**: You can't collaborate with others on Vercel

### Option 2: AWS Secrets Manager / Key Management Service
**If you need team collaboration:**
- Store private key in AWS Secrets Manager (or similar)
- Backend fetches key from Secrets Manager at runtime
- Control access via AWS IAM (can restrict to specific users)
- **Better**: Can audit who accessed the key and when
- **Better**: Can rotate keys without redeploying

### Option 3: Environment-Specific Keys
**If you trust your Vercel team:**
- Use different keys for different environments
- Production key: Only you have access
- Staging/Dev keys: Team can access
- **Limitation**: Still relies on Vercel access control

### Option 4: Hardware Wallet + Backend Service
**Most Secure:**
- Use hardware wallet for signing
- Backend service connects to hardware wallet
- No private key stored anywhere
- **Complex**: Requires hardware wallet infrastructure

### Option 5: Multi-Signature Wallet
**For High Security:**
- Make the master wallet multi-signature
- Requires multiple keys to execute transactions
- Distribute keys among trusted parties
- **Better**: No single point of failure

---

## 🎯 Recommended Approach

### For Your Use Case:

**If only FID 318447 should control the wallet:**

1. **Use AWS Secrets Manager** (or similar):
   - Store `MASTER_WALLET_PRIVATE_KEY` in AWS Secrets Manager
   - Give access only to a specific AWS IAM user/role
   - Backend fetches from Secrets Manager (not Vercel env vars)
   - **Result**: Only people with AWS access can see the key

2. **OR Use Vercel with strict access control**:
   - Only you have access to Vercel project
   - Don't add team members who shouldn't see the key
   - Use separate Vercel project for team collaboration (without the key)

3. **Add additional app-level checks**:
   - Before refund/settle, verify requester FID == 318447
   - This adds defense-in-depth (even if someone gets Vercel access)

---

## 🔧 Quick Fix: Add FID Check

We can add a check to ensure only FID 318447 can trigger refund/settle:

```typescript
// In refund/settle routes
if (parseInt(requesterFid, 10) !== 318447) {
  return NextResponse.json({ ok: false, error: "Only super owner can perform this action" }, { status: 403 });
}
```

**This helps but doesn't solve the root problem:**
- Still requires Vercel access to see the key
- But adds an extra permission check in the app

---

## 📊 Access Matrix

| Person/System | Can See Private Key? | Can Use Refund/Settle? |
|---------------|---------------------|------------------------|
| Vercel Account Owner | ✅ YES | ✅ YES (if has Vercel access) |
| Vercel Team Member | ✅ YES | ✅ YES (if has Vercel access) |
| FID 318447 (via app) | ❌ NO | ✅ YES (if we add check) |
| Regular App User | ❌ NO | ❌ NO |
| AWS Secrets Manager User | ✅ YES (if given access) | ✅ YES |
| Local Developer | ✅ YES (if has .env.local) | ✅ YES |

---

## 🎯 Bottom Line

**Current Plan**: 
- ❌ Does NOT restrict key visibility to FID 318447
- ❌ Anyone with Vercel project access can see the key
- ✅ FID 318447 is just for app permissions, not key access

**To fix this**, you need to:
1. Use a key management service (AWS Secrets Manager) OR
2. Keep Vercel access limited to only yourself OR
3. Add FID 318447 check + use key management service

---

**Recommendation**: Use AWS Secrets Manager if you want true access control tied to specific users/roles, not just Vercel project access.

