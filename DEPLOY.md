# Deploying to Vercel (Frontend) + Railway (Backend)

> **Why split?**  
> The backend needs `pdftoppm`, `libreoffice`, and Puppeteer — system binaries unavailable in Vercel serverless. Railway runs a full Linux container which supports all of them.

---

## Step 1 — Push to GitHub

First, push the entire project to a GitHub repo.

```bash
cd /home/soham/Documents/Reimbursements
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/reimbursements.git
git push -u origin main
```

---

## Step 2 — Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select your repo → choose the **`backend/`** folder as the root directory
   - In Railway: Settings → **Root Directory** → set to `backend`
3. Railway detects the `Dockerfile` automatically and builds it
4. After deploy, go to **Settings → Networking → Generate Domain**
5. Copy the URL (e.g. `https://reimbursements-backend.up.railway.app`)

### Railway Environment Variables (Settings → Variables)

| Key | Value |
|---|---|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | *(set after Vercel deploy — see Step 3)* |

---

## Step 3 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select your repo → set **Root Directory** to `frontend`
3. Build settings are auto-detected from `vercel.json`:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### Vercel Environment Variables (Project Settings → Environment Variables)

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://your-railway-app.up.railway.app` ← Railway URL from Step 2 |

4. Click **Deploy** — Vercel will build and give you a URL like `https://reimbursements.vercel.app`

---

## Step 4 — Wire Up CORS

Go back to **Railway → Variables** and set:

```
FRONTEND_URL = https://reimbursements.vercel.app
```

Then **redeploy** the Railway backend (Deployments → Redeploy).

---

## Step 5 — Done ✅

| Service | URL |
|---|---|
| Frontend | `https://reimbursements.vercel.app` |
| Backend  | `https://reimbursements-backend.up.railway.app` |
| Health check | `https://reimbursements-backend.up.railway.app/health` |

---

## File Changes Made for Deployment

| File | What changed |
|---|---|
| `backend/Dockerfile` | Installs poppler-utils, libreoffice, chromium |
| `backend/index.js` | CORS now reads `FRONTEND_URL` env var |
| `frontend/vercel.json` | Build config + SPA routing for Vercel |
| `frontend/.env.production` | Set `VITE_API_URL` → Railway URL |
| `frontend/src/App.jsx` | Fetch uses `import.meta.env.VITE_API_URL` |

---

## Re-deploying After Changes

**Backend change** → push to GitHub → Railway auto-redeploys  
**Frontend change** → push to GitHub → Vercel auto-redeploys
