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
};

const CREDITS: Record<string, number> = {
  starter: 10,
  pro:     50,
  max:     200,
  one:     3, // <-- Mis à jour : Le plan 'one' donne maintenant 3 crédits
};

export async function GET(req: Request) {
  // 1. Vérification stricte de la session utilisateur Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const plan    = searchParams.get('plan') ?? 'pro';
  const billing = searchParams.get('billing') ?? 'monthly';

  // 2. Attribution du Price ID Stripe
  let priceId = PRICE_IDS[plan]?.[billing];
  
  if (plan === 'one') { // <-- Changement de 'oneshot' à 'one'
    priceId = process.env.STRIPE_PRICE_ONESHOT!; 
  }

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan or billing period' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // 3. Création de la session Stripe de manière sécurisée
  const session = await stripe.checkout.sessions.create({
    mode: plan === 'one' ? 'payment' : 'subscription', // Mode 'payment' unique pour le plan 'one'
    payment_method_types: ['card'],
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      plan,
      billing: plan === 'one' ? 'one-time' : billing,
      user_id: user.id,
      credits: String(CREDITS[plan] ?? 3), // Transmet "3" dans les métadonnées Stripe
    },
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url:  `${appUrl}/#pricing`,
  });

  return NextResponse.json({ url: session.url });
}
