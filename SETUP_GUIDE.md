# ProFaceApp Setup Guide

## Overview
This guide will help you configure ProFaceApp with Stripe payments and credit system.

## ✅ Completed Configuration

### 1. Supabase ✅
- **Project**: Profaceapp (ydmvaqwnravhkyswfmiu)
- **Region**: us-east-1
- **Status**: Active & Healthy
- **Migration Applied**: `credited_stripe_sessions` column added to profiles table

### 2. Stripe Products & Prices ✅

#### Starter Plan - $19/month (100 credits)
- Monthly: `price_1Taw0vFI9TKZo7n9tsxsVR2v`
- Yearly: `price_1Taw0yFI9TKZo7n9tPpkzy2U`

#### Pro Plan - $49/month (250 credits)
- Monthly: `price_1Taw10FI9TKZo7n9YUuivMN3`
- Yearly: `price_1Taw13FI9TKZo7n94wVNkIvT`

#### Max Plan - $99/month (1000 credits)
- Monthly: `price_1Taw15FI9TKZo7n90n8TdaRK`
- Yearly: `price_1Taw18FI9TKZo7n93v9iwjqz`

#### One-Shot - $5 (10 credits, one-time)
- One-time: `price_1Taw1AFI9TKZo7n9L8552BWv`

---

## ⚠️ Required Configuration

### Step 1: Get Stripe Test Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Make sure you're in **Test Mode** (toggle in top-left)
3. Copy your **Secret Key** (starts with `sk_test_`)
4. Copy your **Publishable Key** (starts with `pk_test_`)

### Step 2: Create Stripe Webhook

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter endpoint URL: `https://profaceapp-2026.vercel.app/api/webhooks/stripe`
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 3: Configure Vercel Environment Variables

Add these to your Vercel project settings:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project: `profaceapp-2026-u2zi`
3. Go to **Settings** → **Environment Variables**
4. Add the following (all test mode):

```
STRIPE_SECRET_KEY = sk_test_...
STRIPE_WEBHOOK_SECRET = whsec_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_test_...

STRIPE_PRICE_STARTER_MONTHLY = price_1Taw0vFI9TKZo7n9tsxsVR2v
STRIPE_PRICE_STARTER_YEARLY = price_1Taw0yFI9TKZo7n9tPpkzy2U
STRIPE_PRICE_PRO_MONTHLY = price_1Taw10FI9TKZo7n9YUuivMN3
STRIPE_PRICE_PRO_YEARLY = price_1Taw13FI9TKZo7n94wVNkIvT
STRIPE_PRICE_MAX_MONTHLY = price_1Taw15FI9TKZo7n90n8TdaRK
STRIPE_PRICE_MAX_YEARLY = price_1Taw18FI9TKZo7n93v9iwjqz
STRIPE_PRICE_ONESHOT = price_1Taw1AFI9TKZo7n9L8552BWv

NEXT_PUBLIC_SUPABASE_URL = https://ydmvaqwnravhkyswfmiu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkbXZhcXducmF2aGt5c3dmbWl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzk2NzMsImV4cCI6MjA5NDk1NTY3M30.BHO-DMT9UCRsZaFuhyFPtQ6THrGAf6vUnTutRN3MA7I
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkbXZhcXducmF2aGt5c3dmbWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM3OTY3MywiZXhwIjoyMDk0OTU1NjczfQ.gxUfkI5p3WrDCr1SfmXDK8W0DaI6c2K3Z8Z8Z8Z8Z8Z

REPLICATE_API_TOKEN = r8_...
NEXT_PUBLIC_APP_URL = https://profaceapp-2026.vercel.app
```

### Step 4: Create Test Stripe Account

1. Go to [Stripe Test Cards](https://stripe.com/docs/testing)
2. Use card: `4242 4242 4242 4242`
3. Use any future expiration date
4. Use any 3-digit CVC

---

## 📋 Testing Checklist

Once all environment variables are configured, test the following:

### Local Testing (optional)
```bash
npm install
npm run dev
# Visit http://localhost:3000
```

### Production Testing on Vercel

1. **Sign Up**
   - Create account at https://profaceapp-2026.vercel.app

2. **View Dashboard**
   - Check credits display (should be 0 initially)
   - Navigate to dashboard after signup

3. **Buy Starter Plan ($19)**
   - Click "Buy credits" button
   - Select Starter monthly ($19)
   - Use test card: `4242 4242 4242 4242`
   - Complete payment

4. **Verify Credits Added**
   - After successful payment, you should see **100 credits** in dashboard
   - If not, check Stripe webhook in dashboard

5. **Generate Photo** (requires Replicate API token)
   - Upload selfie
   - Generate headshot (costs 10 credits)
   - Verify credits decrease to 90

6. **Test Webhook**
   - Go to Stripe Dashboard → Events
   - Look for `checkout.session.completed` event
   - Click it and expand the payload
   - Verify `metadata.credits` is present

---

## 🔍 Debugging

### Credits Not Appearing?

1. **Check Supabase Profiles Table**
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Navigate to SQL Editor
   - Run:
   ```sql
   SELECT id, email, credits, credited_stripe_sessions FROM public.profiles LIMIT 10;
   ```

2. **Check Stripe Webhook**
   - Verify webhook is receiving events
   - Check Stripe Dashboard → Webhooks → Events
   - Look for `checkout.session.completed` events

3. **Check Logs**
   - Vercel: Deployments → Select latest → Logs
   - Look for `[stripe-webhook]` or `[checkout-confirm]` messages

4. **Check Database Logs**
   - Supabase: Logs → Database
   - Look for errors in profile update

### Common Issues

| Problem | Solution |
|---------|----------|
| 401 Unauthorized | Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Webhook not firing | Check webhook URL in Stripe Dashboard |
| "Invalid session" | Stripe price IDs don't match |
| "No credits to add" | Verify `STRIPE_PRICE_*` env vars are set |

---

## 📱 Credits System

### Credit Amounts per Plan
- **Starter**: 100 credits/month
- **Pro**: 250 credits/month
- **Max**: 1000 credits/month
- **One-Shot**: 10 credits

### Credit Cost per Action
- **Generate 1 headshot**: 10 credits (spend_credit function)
- **Refund on failure**: 10 credits (generation failed)

### Credit Flow
1. User buys plan → Stripe checkout
2. Checkout success → Webhook triggered
3. Webhook checks `metadata.credits`
4. Webhook calls `addCredits()` function
5. Credits added to user profile
6. User sees credits in dashboard

---

## 🚀 Next Steps

1. ✅ Configure Stripe test keys in Vercel
2. ✅ Create webhook in Stripe
3. ✅ Test payment flow with test card
4. ✅ Verify credits appear
5. 🔲 Test image generation (requires Replicate token)
6. 🔲 Switch to production mode (when ready)

---

## Support

For issues:
- Check Stripe Dashboard → Logs
- Check Vercel Logs
- Check Supabase Database
- Review webhook payloads in Stripe

