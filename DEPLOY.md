# ProFaceApp 2026 — Deployment Guide

## What's in this folder

Complete Next.js 15 rewrite of ProFaceApp with:
- Full landing page (converted from Claude Design prototype)
- **Supabase Auth** — real signup/login wired to modal
- **Credits system** — users table with credits balance
- **Stripe webhook** — auto-adds credits on `checkout.session.completed`
- **Dashboard** — credits display + all generated photo packs
- **Generate flow** — deducts 1 credit, calls Replicate, saves photos

---

## Step 1 — Supabase schema

1. Open your Supabase project: https://supabase.com/dashboard/project/ydmvaqwnravhkyswfmiu
2. Go to **SQL Editor**
3. Paste and run the contents of `supabase/migrations/001_initial.sql`

This creates: `profiles`, `packs`, `credits_log` tables + RLS policies + trigger to auto-create profile on signup.

---

## Step 2 — Stripe Price IDs

In Stripe Dashboard, create **6 prices** (recurring subscriptions):

| Plan    | Billing | Amount |
|---------|---------|--------|
| Starter | Monthly | $9/mo  |
| Starter | Yearly  | $84/yr ($7/mo) |
| Pro     | Monthly | $29/mo |
| Pro     | Yearly  | $276/yr ($23/mo) |
| Max     | Monthly | $99/mo |
| Max     | Yearly  | $948/yr ($79/mo) |

Copy the `price_xxx` IDs — you'll need them for env vars.

---

## Step 3 — Environment variables in Vercel

Go to your Vercel project → Settings → Environment Variables and add:

```
NEXT_PUBLIC_SUPABASE_URL        = https://ydmvaqwnravhkyswfmiu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = (from Supabase → Project Settings → API)
SUPABASE_SERVICE_ROLE_KEY       = (from Supabase → Project Settings → API)

STRIPE_SECRET_KEY               = sk_live_...
STRIPE_WEBHOOK_SECRET           = whsec_...  (set after step 4)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...

STRIPE_PRICE_STARTER_MONTHLY    = price_...
STRIPE_PRICE_STARTER_YEARLY     = price_...
STRIPE_PRICE_PRO_MONTHLY        = price_...
STRIPE_PRICE_PRO_YEARLY         = price_...
STRIPE_PRICE_MAX_MONTHLY        = price_...
STRIPE_PRICE_MAX_YEARLY         = price_...

REPLICATE_API_TOKEN             = r8_...
NEXT_PUBLIC_APP_URL             = https://profaceapp.com
```

---

## Step 4 — Stripe webhook

In Stripe Dashboard → Developers → Webhooks:
- Add endpoint: `https://profaceapp.com/api/webhooks/stripe`
- Events to listen to: `checkout.session.completed`
- Copy the signing secret (`whsec_...`) → add to Vercel as `STRIPE_WEBHOOK_SECRET`

---

## Step 5 — Push to GitHub

```bash
# In your local Adrien-06/profaceapp-2026 repo:
# Delete all existing files at root, then copy these files in

git add -A
git commit -m "feat: Next.js 15 app with Supabase auth + credits system + dashboard"
git push origin main
```

Vercel auto-deploys on push to main.

---

## File structure

```
src/
  app/
    page.tsx              ← Full landing page (React client component)
    layout.tsx            ← HTML shell + Poppins font
    globals.css           ← All styles (matches Claude Design exactly)
    dashboard/
      page.tsx            ← Server component (auth check + data fetch)
      DashboardClient.tsx ← Dashboard UI with credits + packs
    api/
      checkout/route.ts          ← Creates Stripe checkout session
      generate/route.ts          ← Calls Replicate, deducts credit
      webhooks/stripe/route.ts   ← Adds credits after payment
      webhooks/replicate/route.ts← Saves photos when generation done
  lib/
    supabase/
      client.ts  ← Browser Supabase client
      server.ts  ← Server + service-role Supabase clients
middleware.ts    ← Protects /dashboard, redirects logged-in users from /auth
supabase/
  migrations/001_initial.sql   ← Run this in Supabase SQL editor
```
