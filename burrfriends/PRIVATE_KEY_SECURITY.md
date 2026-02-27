# Private Key Security Guide

## 🔐 What You Need to Use

### ✅ Use: Single Wallet Private Key
- **Format:** `0x` + 64 hex characters
- **Example:** `0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`
- **Length:** Exactly 66 characters (0x + 64 hex)
- **Where:** From your wallet software (MetaMask, etc.) → Account → Export Private Key

### ❌ DO NOT Use: 12-Word Seed Phrase
- **Never put your 12-word mnemonic anywhere!**
- Seed phrases can generate multiple wallets/keys
- If compromised, ALL wallets from that seed are at risk

## 🔍 How to Get Your Private Key

### If using MetaMask:
1. Open MetaMask
2. Click the account icon (top right)
3. Select the wallet: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
4. Click "Account Details"
5. Click "Show Private Key"
6. Enter your password
7. Copy the private key (starts with `0x`)

### If using another wallet:
- Look for "Export Private Key" or "Show Private Key" option
- Make sure you're exporting for the specific address: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

## 🛡️ Security Guarantees

### ✅ The Private Key is:
- ✅ **Encrypted** in Vercel's servers
- ✅ **Server-side only** (never sent to browser)
- ✅ **Not in your code** (environment variable only)
- ✅ **Not on-chain** (smart contracts don't store private keys)

### ⚠️ The Private Key CAN be seen by:
- You (Vercel project owner)
- Anyone you grant admin access to the Vercel project
- Vercel employees (for support, if needed)

### ❌ The Private Key CANNOT be seen by:
- Players/users of your app
- People viewing your code on GitHub
- People inspecting the smart contract
- Anyone without Vercel admin access

## 🔒 Best Practices

1. **Use a dedicated hot wallet:**
   - This wallet (`0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`) is a hot wallet
   - Only keep minimal funds needed for operations
   - Transfer funds out regularly

2. **Limit Vercel access:**
   - Only grant admin access to people you trust
   - Use team roles if needed

3. **Monitor the wallet:**
   - Set up alerts for transactions
   - Regularly check wallet activity
   - Use the ALERT_WEBHOOK_URL if you set it up

4. **Rotate if compromised:**
   - If you suspect compromise, deploy a new contract with a new wallet
   - Update the private key in Vercel

## 📝 Format Verification

Your private key should look like this:
```
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

NOT like this (12-word phrase):
```
word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
```

NOT like this (without 0x prefix):
```
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

