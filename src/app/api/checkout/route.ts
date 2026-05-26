import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// Test-mode Stripe price IDs as fallback when env vars are not set
const TEST_PRICE_IDS = {
  starter: { monthly: 'price_1Taw0vFI9TKZo7n9tsxsVR2v', yearly: 'price_1Taw0yFI9TKZo7n9tPpkzy2U' },
  pro:     { monthly: 'price_1Taw10FI9TKZo7n9YUuivMN3', yearly: 'price_1Taw13FI9TKZo7n94wVNkIvT' },
  max:     { monthly: 'price_1Taw15FI9TKZo7n90n8TdaRK', yearly: 'price_1Taw18FI9TKZo7n93v9iwjqz' },
  oneshot: { monthly: 'price_1Taw1AFI9TKZo7n9L8552BWv', yearly: 'price_1Taw1AFI9TKZo7n9L8552BWv' },
} as const;

const PRICE_IDS: Record<string, Record<string, string>> = {
    starter: {
          monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || TEST_PRICE_IDS.starter.monthly,
          yearly:  process.env.STRIPE_PRICE_STARTER_YEARLY  || TEST_PRICE_IDS.starter.yearly,
    },
    pro: {
          monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || TEST_PRICE_IDS.pro.monthly,
          yearly:  process.env.STRIPE_PRICE_PRO_YEARLY  || TEST_PRICE_IDS.pro.yearly,
    },
    max: {
          monthly: process.env.STRIPE_PRICE_MAX_MONTHLY || TEST_PRICE_IDS.max.monthly,
          yearly:  process.env.STRIPE_PRICE_MAX_YEARLY  || TEST_PRICE_IDS.max.yearly,
    },
    oneshot: {
          monthly: process.env.STRIPE_PRICE_ONESHOT || TEST_PRICE_IDS.oneshot.monthly,
          yearly:  process.env.STRIPE_PRICE_ONESHOT || TEST_PRICE_IDS.oneshot.yearly,
    },
};

const CREDITS: Record<string, number> = {
    starter: 100,
    pro:     250,
    max:     1000,
    oneshot: 10,
};

export async function GET(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
    const plan    = searchParams.get('plan')    ?? 'pro';
    const billing = searchParams.get('billing') ?? 'monthly';

  const priceId = PRICE_IDS[plan]?.[billing];
    if (!priceId) {
          return NextResponse.json({ error: 'Invalid plan or billing period' }, { status: 400 });
    }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const isOneShot = plan === 'oneshot';

  const session = await stripe.checkout.sessions.create({
        mode: isOneShot ? 'payment' : 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
                plan,
                billing,
                user_id: user.id,
                credits: String(CREDITS[plan] ?? 10),
        },
        success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/#pricing`,
  });

  return NextResponse.json({ url: session.url });
}
