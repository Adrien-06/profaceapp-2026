import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const PRICE_IDS: Record<string, Record<string, string>> = {
    starter: {
          monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
          yearly:  process.env.STRIPE_PRICE_STARTER_YEARLY!,
    },
    pro: {
          monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
          yearly:  process.env.STRIPE_PRICE_PRO_YEARLY!,
    },
    max: {
          monthly: process.env.STRIPE_PRICE_MAX_MONTHLY!,
          yearly:  process.env.STRIPE_PRICE_MAX_YEARLY!,
    },
    oneshot: {
          monthly: process.env.STRIPE_PRICE_ONESHOT!,
          yearly:  process.env.STRIPE_PRICE_ONESHOT!,
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
    customer_email: user.email!,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      plan,
      billing,
      user_id: user.id,
      user_email: user.email!,
      credits: String(CREDITS[plan] ?? 10),
    },
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/#pricing`,
  });

  return NextResponse.json({ url: session.url });
}
