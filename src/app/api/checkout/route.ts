import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// Test-mode Stripe price IDs as fallback when env vars are not set
const TEST_PRICE_IDS = {
  oneshot: { monthly: 'price_1TbPmdFI9TKZo7n9wiFUw0yn', yearly: 'price_1TbPmdFI9TKZo7n9wiFUw0yn' },
  pro:     { monthly: 'price_1TbPmgFI9TKZo7n9WPwnXeLw', yearly: 'price_1TbPmiFI9TKZo7n9uVTNUHQY' },
  max:     { monthly: 'price_1TbPmlFI9TKZo7n9RfAwyPSm', yearly: 'price_1TbPmnFI9TKZo7n9nsV2KUDr' },
} as const;

const PRICE_IDS: Record<string, Record<string, string>> = {
    oneshot: {
          monthly: process.env.STRIPE_PRICE_ONESHOT || TEST_PRICE_IDS.oneshot.monthly,
          yearly:  process.env.STRIPE_PRICE_ONESHOT || TEST_PRICE_IDS.oneshot.monthly,
    },
    pro: {
          monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || TEST_PRICE_IDS.pro.monthly,
          yearly:  process.env.STRIPE_PRICE_PRO_YEARLY  || TEST_PRICE_IDS.pro.yearly,
    },
    max: {
          monthly: process.env.STRIPE_PRICE_MAX_MONTHLY || TEST_PRICE_IDS.max.monthly,
          yearly:  process.env.STRIPE_PRICE_MAX_YEARLY  || TEST_PRICE_IDS.max.yearly,
    },
};

const CREDITS: Record<string, number> = {
    oneshot: 400,
    pro:     1000,
    max:     2500,
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
        ...(isOneShot ? {} : {
          subscription_data: {
            metadata: {
              plan,
              billing,
              user_id: user.id,
              credits: String(CREDITS[plan] ?? 10),
            },
          },
        }),
        success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/#pricing`,
  });

  return NextResponse.json({ url: session.url });
}
