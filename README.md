# Driveline — Car Cost Comparison

Compare the true total cost of owning different cars across all UK finance types: **Cash, Bank Loan, HP, PCP, and Lease/PCH**.

## Features

- **All UK finance types** — Cash (depreciation estimate), Bank Loan (calculated payment), HP, PCP (with balloon/GMFV), Lease/PCH
- **Full running costs** — Insurance, VED/road tax, fuel (MPG+ppl or miles/kWh+p/kWh for EVs), MOT, servicing, tyres, breakdown cover, parking
- **Side-by-side comparison** — Stacked monthly cost chart, TCO bar chart, and detailed table with best-value highlighting
- **Persistent** — All data stored in Vercel Postgres
- **Shareable comparisons** — Comparison URLs are bookmarkable (e.g. `/compare?ids=uuid1,uuid2`)

---

## Deployment to Vercel (5 steps)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create driveline --public --push   # or create repo manually and push
```

### 2. Import to Vercel

Go to [vercel.com/new](https://vercel.com/new), import your GitHub repo, and deploy. The first build will fail (no DB yet) — that's fine.

### 3. Create a Postgres Database

In your Vercel project: **Storage → Create Database → Postgres (Neon)**.
Name it anything (e.g. `driveline-db`).

### 4. Link the database to your project

From the database page, click **Connect Project** and select your Driveline project. Vercel automatically adds all the required env vars (`POSTGRES_URL`, etc.) to your project.

**Redeploy** from the Vercel dashboard (Deployments → Redeploy).

### 5. Initialise the database tables

Visit once in your browser after deployment:

```
https://your-app.vercel.app/api/setup
```

You should see: `{"success":true,"message":"Database tables created successfully."}`

That's it — start adding cars!

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up env vars
cp .env.local.example .env.local
# Fill in your POSTGRES_URL from the Vercel dashboard
# (Storage → your database → .env.local tab → copy values)

# 3. Run locally
npm run dev

# 4. Initialise DB (first time only)
# Visit: http://localhost:3000/api/setup
```

---

## Finance Types — How TCO is calculated

| Type | TCO formula |
|------|------------|
| **Cash** | (Purchase price − estimated sale value) + running costs |
| **Bank Loan** | Deposit + (calculated monthly × term) + running costs − estimated sale value |
| **HP** | Deposit + (monthly × term) + running costs − estimated sale value |
| **PCP (hand back)** | Deposit + (monthly × term) + running costs |
| **PCP (buy)** | Deposit + (monthly × term) + balloon + running costs − estimated sale value |
| **Lease/PCH** | (Initial rental months × monthly) + (monthly × term) + running costs |

**Depreciation** uses compound annual rate: `end_value = price × (1 − rate)^years`

**Bank Loan monthly payment**: `P × [r(1+r)ⁿ] / [(1+r)ⁿ − 1]` where `r = APR/12/100`, `n = term in months`

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Vercel Postgres (Neon) via `@vercel/postgres`
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Language**: TypeScript
