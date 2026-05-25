# Stripe Webhook Setup Guide

This guide will help you set up the Stripe webhook for ProFaceApp credit system.

## What Does the Webhook Do?

When a user completes payment:
1. Stripe triggers a `checkout.session.completed` event
2. Event is sent to your webhook endpoint
3. Webhook verifies the signature and extracts payment details
4. Credits are added to the user's account in Supabase
5. User sees credits immediately in the dashboard

## Step-by-Step Setup

### 1. Get Your Webhook Endpoint URL

Your webhook endpoint is:
```
https://profaceapp-2026.vercel.app/api/webhooks/stripe
```

### 2. Add Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Make sure you're in **TEST MODE** (see top-left toggle)
3. Click on **Webhooks** in the left sidebar
4. Click **Add endpoint**

### 3. Configure the Endpoint

In the "Add endpoint" form:

**Endpoint URL:**
```
https://profaceapp-2026.vercel.app/api/webhooks/stripe
```

**Events to listen to:**
Check these events:
- ✅ `checkout.session.completed` (for initial purchases)
- ✅ `invoice.payment_succeeded` (for subscription renewals)
- ✅ `charge.dispute.created` (optional, for dispute handling)

Click **Add endpoint**

### 4. Copy Your Webhook Secret

1. After creating the endpoint, you'll see a new entry in the Webhooks list
2. Click on the endpoint URL
3. Copy the **Signing secret** (looks like `whsec_test_...`)
4. Add it to Vercel as `STRIPE_WEBHOOK_SECRET`

## How the Webhook Works

### Request Verification

The webhook uses HMAC-SHA256 to verify requests are from Stripe:

```
Signature = HMAC-SHA256(body, webhook_secret)
```

Your application verifies:
1. Request contains a valid `stripe-signature` header
2. Signature matches the computed hash
3. If verification fails, request is rejected

### Data Extraction

When a payment succeeds, the webhook extracts:
- `user_id` from checkout session metadata
- `credits` amount from checkout session metadata
- `plan` name from checkout session metadata

### Credit Addition

The webhook calls the `addCredits()` function which:
1. Looks up user in Supabase by ID or email
2. Calculates new credits: `old_credits + new_credits`
3. Updates profile in database
4. Logs transaction in `credits_log` table

## Testing the Webhook

### Test with Stripe CLI (Local Development)

If testing locally:

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Authenticate: `stripe login`
3. Forward events to local webhook:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
4. This outputs your local webhook secret: `whsec_test_...`

### Test with Stripe Dashboard (Production)

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click your endpoint
3. Scroll to **Recent events**
4. Click on a `checkout.session.completed` event
5. Click **Send to endpoint** to resend

### Manual Payment Testing

1. Go to https://profaceapp-2026.vercel.app
2. Sign up with test email
3. Click "Buy credits"
4. Select a plan
5. Use test card: `4242 4242 4242 4242`
6. Complete payment

Then check:
- Stripe Dashboard → Events → look for `checkout.session.completed`
- Vercel Logs → look for `[stripe-webhook] +100 credits → user`
- Dashboard → refresh and see credits updated

## Webhook Security

### Signature Verification

Never trust webhook data without verification:

```javascript
const signature = req.headers.get('stripe-signature');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

try {
  event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  // Safe to process event
} catch (err) {
  console.error('Webhook verification failed');
  return new NextResponse('Webhook Error', { status: 400 });
}
```

### Environment Variables

Always store secrets securely:
- ❌ Never commit to git
- ✅ Store in Vercel Environment Variables
- ✅ Store in `.env.local` (local testing only)

### Webhook Secrets

Each webhook endpoint has its own secret:
- Test mode has: `whsec_test_...`
- Live mode has: `whsec_live_...`

Never mix them!

## Debugging

### Check if Webhook is Receiving Events

1. Stripe Dashboard → Webhooks → [Your endpoint]
2. Scroll to **Recent events**
3. You should see `checkout.session.completed` events

### Check Event Details

1. Click on an event
2. Expand the **Request** section
3. Verify `metadata` contains:
   - `user_id`: UUID of user
   - `credits`: Number of credits
   - `plan`: Plan name (starter/pro/max/oneshot)

### Check Application Logs

#### Vercel Logs
1. [Vercel Dashboard](https://vercel.com/dashboard)
2. Select: profaceapp-2026-u2zi
3. Go to **Deployments** → Latest → **Logs**
4. Filter for: `stripe-webhook`

Look for:
```
[stripe-webhook] +100 credits → user [uuid] (plan: starter, session: [id]). New total: 100
```

#### Supabase Logs
1. [Supabase Dashboard](https://app.supabase.com)
2. Go to **Logs** → **Database**
3. Look for update on `public.profiles` table

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Webhook verification failed" | Wrong `STRIPE_WEBHOOK_SECRET` | Copy fresh secret from Stripe |
| "No events appearing" | Endpoint URL wrong | Verify URL is exactly correct |
| "404 on webhook" | Endpoint not deployed | Deploy to Vercel or use Stripe CLI forward |
| Credits not adding | User not found | Verify `user_id` matches Supabase user |
| "Invalid JSON body" | Webhook disabled | Check webhook is active in Stripe |

## Advanced Topics

### Subscription Renewals

For recurring subscriptions, the webhook also listens to `invoice.payment_succeeded`:

```javascript
if (event.type === 'invoice.payment_succeeded') {
  // Get subscription details
  const subscription = stripe.subscriptions.retrieve(invoiceId);
  // Add credits for renewal
  addCredits(user_id, subscription.metadata.credits);
}
```

### Idempotency

The webhook is idempotent—if triggered multiple times with the same data:
- First call: adds credits
- Subsequent calls: skipped (already credited)

This is tracked via `credited_stripe_sessions` array in the profile.

### Custom Metadata

You can store custom data in the checkout session:

```javascript
// In /api/checkout/route.ts
metadata: {
  plan: 'starter',
  billing: 'monthly',
  user_id: user.id,
  credits: '100',
  custom_field: 'value', // You can add more
}
```

The webhook can then use this data.

## Production Checklist

Before going live, verify:

- [ ] Webhook endpoint is public (no auth required)
- [ ] `STRIPE_WEBHOOK_SECRET` is configured (test mode)
- [ ] `STRIPE_SECRET_KEY` is configured (test mode)
- [ ] `STRIPE_PUBLISHABLE_KEY` is configured (test mode)
- [ ] Price IDs are configured for all plans
- [ ] Test payment completes successfully
- [ ] Credits appear in dashboard after payment
- [ ] Logs show successful webhook processing
- [ ] Database has credit transaction logged

---

**Need help?** Check the [Setup Guide](SETUP_GUIDE.md) for complete configuration instructions.

