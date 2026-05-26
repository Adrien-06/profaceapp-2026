import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const PLAN_CREDITS: Record<string, number> = {
  oneshot: 400,
  pro:     1000,
  max:     2500,
};

async function addCredits(
  userId: string | null,
  email: string | null,
  credits: number,
  plan: string,
  sessionId: string,
) {
  const supabase = createServiceClient();

  if (!userId && !email) {
    console.error('[stripe-webhook] no user_id or email in session', sessionId);
    return false;
  }

  // Resolve profile
  let query = supabase.from('profiles').select('id').limit(1);
  if (userId) {
    query = query.eq('id', userId);
  } else {
    query = query.eq('email', email!);
  }

  const { data: profiles, error: selectError } = await query;
  if (selectError || !profiles || profiles.length === 0) {
    console.error('[stripe-webhook] user not found', { userId, email, selectError });
    return false;
  }

  const profileId: string = profiles[0].id;

  // Atomic claim via DB function — prevents race condition with /confirm endpoint
  // RPC handles both credit update AND logging, returns true if applied, false if already credited
  const { data: credited, error: rpcError } = await supabase.rpc('credit_stripe_session', {
    p_session_id: sessionId,
    p_user_id: profileId,
    p_credits: credits,
    p_plan: plan,
  });

  if (rpcError) {
    console.error('[stripe-webhook] rpc error:', rpcError);
    return false;
  }

  if (credited) {
    console.log(`[stripe-webhook] +${credits} credits → user ${profileId} (plan: ${plan}, session: ${sessionId})`);
  } else {
    console.log(`[stripe-webhook] session ${sessionId} already credited, skipping`);
  }

  return true;
}

export async function POST(req: Request) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Webhook verification failed';
      console.error('[stripe-webhook] verification failed:', msg);
      return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
    }
  } else {
    console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return new NextResponse('Invalid JSON body', { status: 400 });
    }
  }

  // checkout.session.completed — fires for both subscription & one-time payments
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId  = session.metadata?.user_id ?? null;
    const email   = session.customer_details?.email ?? session.metadata?.user_email ?? null;
    const plan    = session.metadata?.plan ?? 'pro';
    const credits = parseInt(session.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

    if (!credits) {
      console.error('[stripe-webhook] credits = 0, skipping', session.id);
      return NextResponse.json({ received: true });
    }

    await addCredits(userId, email, credits, plan, session.id);
  }

  // invoice.payment_succeeded — fires on subscription renewals
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    // Only handle subscription renewals
    if (invoice.billing_reason !== 'subscription_cycle') {
      return NextResponse.json({ received: true });
    }

    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

    if (!subscriptionId) return NextResponse.json({ received: true });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId  = subscription.metadata?.user_id ?? null;
    const email   = invoice.customer_email ?? null;
    const plan    = subscription.metadata?.plan ?? 'pro';
    const credits = parseInt(subscription.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

    if (credits) {
      await addCredits(userId, email, credits, plan, invoice.id);
    }
  }

  return NextResponse.json({ received: true });
}
