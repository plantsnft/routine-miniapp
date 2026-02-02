# Running Verification Scripts

## Prerequisites
- Node.js installed
- `.env.local` file exists in the `basketball` directory with Supabase credentials

## How to Run Verification Scripts

### Step 1: Navigate to the basketball directory

**From Command Prompt (Windows):**
```cmd
cd c:\miniapps\routine\basketball
```

**From PowerShell (Windows):**
```powershell
cd c:\miniapps\routine\basketball
```

**From Git Bash / Terminal:**
```bash
cd /c/miniapps/routine/basketball
```

### Step 2: Run the verification script

**Verify Phase 2 SoT Compliance:**
```bash
node scripts/verify-sot-compliance.mjs
```

**Check Current League State:**
```bash
node scripts/check-state.mjs
```

**Verify Phase 2 Completion:**
```bash
node scripts/verify-phase2.mjs
```

## Available Scripts

### `scripts/verify-sot-compliance.mjs`
**Purpose**: Comprehensive verification against SoT requirements
- Checks all profiles, teams, players
- Verifies team assignments
- Validates player distribution, positions, salaries, contracts
- Checks season state and stats records

### `scripts/check-state.mjs`
**Purpose**: Quick check of current league state
- Shows season state
- Lists teams and player counts
- Useful for quick status checks

### `scripts/verify-phase2.mjs`
**Purpose**: Verify Phase 2 completion
- Checks teams and owners
- Verifies player counts per team
- Validates team assignments

## Example Output

When you run `verify-sot-compliance.mjs`, you should see:
```
🔍 Verifying Phase 2 Against SoT Requirements

============================================================

📋 SoT Section 10: Initial Accounts / Teams

1. Profiles (4 required):
   ✅ 4 profiles found
   ...

============================================================

✅ ALL SoT REQUIREMENTS MET - Phase 2 Implementation is Correct!
```

## Troubleshooting

**Error: "Could not read .env.local"**
- Make sure you're in the `basketball` directory
- Verify `.env.local` exists in the `basketball` folder

**Error: "SUPABASE_URL not configured"**
- Check that `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` set
- Check that `SUPABASE_SERVICE_ROLE` is set

**Error: "Cannot find module"**
- Make sure you're running from the `basketball` directory (not `routine`)
- Verify Node.js is installed: `node --version`
