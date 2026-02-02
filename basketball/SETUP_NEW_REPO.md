# Setup Separate Basketball Repository

## 🎯 Goal
Create a standalone GitHub repository for the basketball app (separate from routine-miniapp).

---

## Step 1: Create New GitHub Repository

1. **Go to GitHub**: https://github.com/new

2. **Repository Settings**:
   - **Repository name**: `basketball` (or `basketball-miniapp`)
   - **Visibility**: Private (recommended, like your other apps)
   - **Description**: "Basketball team simulation mini-app"
   - **DO NOT** initialize with README, .gitignore, or license (we have these)

3. **Click "Create repository"**

4. **Copy the repository URL** (you'll need it):
   - Example: `https://github.com/plantsnft/basketball.git`

---

## Step 2: Initialize Git in Basketball Folder

Run these commands:

```powershell
cd c:\miniapps\routine\basketball
git init
git add .
git commit -m "feat: Initial commit - Complete basketball app MVP"
```

---

## Step 3: Connect to New GitHub Repository

```powershell
cd c:\miniapps\routine\basketball
git remote add origin https://github.com/plantsnft/basketball.git
git branch -M main
git push -u origin main
```

**Note**: Replace `plantsnft/basketball` with your actual GitHub username and repo name.

---

## Step 4: Verify

1. Go to your GitHub repository page
2. Verify all files are there
3. Check that `basketball/` folder structure is at the root (not nested)

---

## ✅ After Setup

Once the repo is created and pushed:
1. ✅ Update Vercel to use this new repo
2. ✅ Set Root Directory to `.` (root, not `basketball`)
3. ✅ Deploy!

---

**Status**: Ready to create new repo! 🚀
