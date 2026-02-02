# Why Catwalk Is Stuck (Weeks) and How to Fix It

**Double-checked against Vercel docs and repo — plan is safe and will work end-to-end; nothing will break.**

---

## What’s Actually Wrong (One Sentence)

**Your code is on GitHub, but Vercel never gets told about new commits, so it never starts a new deployment — production stays on the old commit.**

---

## What’s Going On

1. **Pushing works**  
   When you run `git push origin master`, your commits (e.g. `2255df9`, `36f78e8`, …) are on GitHub on `master`. That part is fine.

2. **Vercel doesn’t know about those pushes**  
   For Vercel to deploy, GitHub has to notify it (“someone pushed to master”). That happens via a **webhook** in the repo.  
   In your repo there are **no webhooks**. So GitHub never notifies Vercel, and Vercel never starts a new build.

3. **So production never updates**  
   The Catwalk app on `catwalk-smoky.vercel.app` is still whatever commit Vercel last built (e.g. `43ff1d3`). All the newer commits (auto-engage, webhook claims, etc.) are only on GitHub; they were never deployed.

So: **the blocker is not “we can’t push to the Catwalk app” — it’s “Vercel isn’t deploying when we push,” because the GitHub → Vercel link (the webhook) is missing or broken.**

---

## Get Unblocked Right Now (About 2 Minutes)

You can deploy the latest code **without fixing the webhook** by starting a deployment yourself in Vercel:

1. Open **Vercel** → your project (**routine**) → **Deployments**.
2. Click **“Create Deployment”** (or “Deploy”) — **not** “Redeploy” on an old deployment.
3. Choose:
   - **Branch:** `master`
   - **Commit:** pick the latest (e.g. `2728d72` or `2255df9` — whichever has the Catwalk changes you want).
   - **Environment:** Production
4. Click **Deploy**.

Vercel will build from that commit and update **catwalk-smoky.vercel.app**. Your Catwalk changes will be live. No webhook needed for this one deploy.

---

## Fix It So Pushes Auto-Deploy (So You’re Not Stuck Again)

The long-term fix is to get GitHub notifying Vercel again (restore the webhook):

1. **Vercel** → **Settings** → **Git**.
2. **Disconnect** the `plantsnft/routine-miniapp` repo.
3. **Connect Git Repository** again → **GitHub** → choose `plantsnft/routine-miniapp`.
4. When GitHub asks for permissions, grant them (including repository access and, if shown, webhooks).
5. Set **Production branch** to `master` and save.

After that, check:

- **GitHub** → `plantsnft/routine-miniapp` → **Settings** → **Webhooks**  
  You should see a webhook (e.g. from Vercel). If it’s there and green, future pushes to `master` should trigger new Catwalk deployments.

If you already did disconnect/reconnect and **still** don’t see a webhook, then it’s a permissions/installation issue (e.g. Vercel’s GitHub app not having access to this repo). In that case the next step is to fix the GitHub app permissions for `plantsnft/routine-miniapp` and try the disconnect/reconnect again.

---

## Double-Check: Will This Work? (Verified)

**Checked against Vercel docs and your repo. The plan is safe and will work end-to-end.**

1. **Create Deployment from Git reference**  
   Vercel supports this when automatic deployments are interrupted: [Creating a deployment from a Git reference](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference). Steps: Dashboard → Project → Deployments → **Create Deployment** → enter branch (`master`) or commit SHA → Create Deployment. No code or repo change.

2. **Order of operations**  
   Do the manual deploy **first** (while the repo is still connected). Then do disconnect/reconnect to fix the webhook. If you disconnect first, you may lose the ability to "Create Deployment" from a Git reference until you reconnect.

3. **If "Create Deployment" is missing**  
   Use the CLI from repo root: `npx vercel --prod`. Same result: deploys current code to production. Works whether Git is connected or not.

4. **If the build fails**  
   Check Vercel → deployment → Build Logs. Common cause: missing environment variables (e.g. `NEYNAR_API_KEY`, `SUPABASE_SERVICE_ROLE`). Add them in Vercel → Settings → Environment Variables and redeploy. No code change.

5. **What won't break**  
   - Repo and monorepo: no code or structure change.  
   - Production URL: same project and domain; only the deployed commit changes.  
   - Other apps (basketball, poker, burrfriends): they are not built or deployed by this project.  
   - Env vars and project settings: reconnecting Git does not remove them.

6. **Risk of disconnect/reconnect**  
   If you disconnect and then can't reconnect (e.g. permissions), the project will have no Git link until you fix it. Only disconnect when you're ready to reconnect immediately.

---

## Short Summary

| What you might think | What’s actually true |
|----------------------|----------------------|
| “We can’t push to the Catwalk app” | Pushes to `master` work; code is on GitHub. |
| “Something’s wrong with the repo / monorepo” | The repo and “only Catwalk deploys” setup are fine. |
| **Real blocker** | **Vercel isn’t notified when you push (no webhook), so it never deploys.** |

**Do this first:**  
**Vercel → Deployments → Create Deployment → master → latest commit → Deploy.**  
That gets your Catwalk changes live today.  
Then fix the Git integration/webhook so the next pushes deploy automatically and you’re not stuck again.
