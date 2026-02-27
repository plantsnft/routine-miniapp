# GitHub Repository Setup - Burrfriends

## Overview

Burrfriends mini app uses a **separate GitHub repository** (`plantsnft/burrfriends`) for complete independence from the poker app.

## Repository Details

- **Repository Name:** `burrfriends`
- **Owner:** `plantsnft`
- **Visibility:** Private
- **Default Branch:** `burrfriends`
- **URL:** https://github.com/plantsnft/burrfriends

---

## Setup Instructions

### Step 1: Create GitHub Repository

1. Go to: https://github.com/new
2. Repository name: `burrfriends`
3. Owner: `plantsnft`
4. Description: "Burrfriends mini app - poker games with BETR token"
5. Visibility: **Private**
6. **DO NOT** check any initialization options (README, .gitignore, license)
7. Click "Create repository"

### Step 2: Update Git Remote

After creating the repository, update the remote URL in your local `burrfriends/` directory:

```bash
cd c:\miniapps\routine\burrfriends

# Verify current remote
git remote -v

# Change remote to new repository
git remote set-url origin https://github.com/plantsnft/burrfriends.git

# Verify new remote
git remote -v
```

Expected output:
```
origin  https://github.com/plantsnft/burrfriends.git (fetch)
origin  https://github.com/plantsnft/burrfriends.git (push)
```

### Step 3: Push to New Repository

```bash
# Verify you're on burrfriends branch
git branch

# Push to new repository (burrfriends branch will be the default)
git push -u origin burrfriends
```

### Step 4: Verify on GitHub

1. Go to: https://github.com/plantsnft/burrfriends
2. Verify all files are present
3. Verify branch is `burrfriends`
4. Verify repository is private

---

## Vercel Deployment

After the repository is set up:

1. Go to Vercel dashboard: https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Click "Import Git Repository"
4. Select: `plantsnft/burrfriends`
5. Select branch: `burrfriends`
6. Configure project name: `burrfriends`
7. Set environment variables (see Phase 11.3 in plan)
8. Deploy

---

## Notes

- This repository is completely separate from `plantsnft/poker`
- No shared Git history or branches
- Independent version control
- Easier to manage and deploy separately
