import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const PLAN_CREDITS: Record<string, number> = {
    starter: 100,
    pro:     250,
    max:     1000,
    oneshot: 10,
};

async function addCredits(userId: string | null, email: string | null, credits: number, plan: string, sessionId: string) {
    const supabase = createServiceClient();

  if (!userId && !email) {
        console.error('[stripe-webhook] no user_id or email in session', sessionId);
        return false;
  }

  let query = supabase
      .from('profiles')
      .select('id, credits, credited_stripe_sessions')
      .limit(1);

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

  const profile = profiles[0];
  const creditedSessions: string[] = profile.credited_stripe_sessions || [];

  if (creditedSessions.includes(sessionId)) {
    console.log('[stripe-webhook] already credited, skipping', sessionId);
    return true;
  }

  const newCredits = (profile.credits ?? 0) + credits;

  const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newCredits, credited_stripe_sessions: [...creditedSessions, sessionId], updated_at: new Date().toISOString() })
      .eq('id', profile.id);

  if (updateError) {
        console.error('[stripe-webhook] update error:', updateError);
        return false;
  }

  console.log(`[stripe-webhook] +${credits} credits → user ${profile.id} (plan: ${plan}, session: ${sessionId}). New total: ${newCredits}`);
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

  if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = session.metadata?.user_id ?? null;
        const email   = session.customer_details?.email ?? session.metadata?.user_email ?? null;
        const plan    = session.metadata?.plan ?? 'starter';
        const credits = parseInt(session.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

      if (!credits) {
              console.error('[stripe-webhook] credits = 0, skipping', session.id);
              return NextResponse.json({ received: true });
      }

      await addCredits(userId, email, credits, plan, session.id);
  }

  if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
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
        const plan    = subscription.metadata?.plan ?? 'starter';
        const credits = parseInt(subscription.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

      if (credits) {
              await addCredits(userId, email, credits, plan, invoice.id);
      }
  }

  return NextResponse.json({ received: true });
}
