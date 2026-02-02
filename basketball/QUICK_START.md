# Quick Start - Historical Mode Setup

## 🚀 Copy & Paste These Commands

### 1. Open Terminal
Press `Win + R`, type `cmd`, press Enter

### 2. Go to Basketball Folder
```bash
cd c:\miniapps\routine\basketball
```

### 3. Run These Commands (One at a Time)

**Reset Data:**
```bash
node scripts/reset-data.mjs
```

**Scrape MaxPreps:**
```bash
node scripts/scrape-maxpreps.mjs
```

**Calculate Ratings:**
```bash
node scripts/calculate-historical-ratings.mjs
```

---

## 📋 Also Do This in Supabase

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Open file: `supabase_migration_historical_mode.sql`
4. Copy ALL the text
5. Paste into SQL Editor
6. Click **Run**

---

## ✅ How to Know It Worked

After running the scripts, check Supabase:
- Go to **Table Editor**
- Look at `basketball.historical_players` - should have players
- Look at `basketball.historical_teams` - should have teams
- Look at `basketball.historical_schedules` - should have games

---

## ❌ If Something Breaks

Just tell me:
- Which command failed
- What error message you saw
- I'll help fix it!
