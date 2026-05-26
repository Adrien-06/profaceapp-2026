import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const PLAN_CREDITS: Record<string, number> = {
  starter: 100,
  pro: 250,
  max: 1000,
  oneshot: 10,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ credited: false, reason: 'not_paid' });
  }

  const plan = session.metadata?.plan ?? 'starter';
  const credits = parseInt(session.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

  if (!credits) {
    return NextResponse.json({ error: 'No credits to add' }, { status: 400 });
  }

  // Atomic claim via DB function — prevents race condition with webhook
  const serviceClient = createServiceClient();
  const { data: credited, error: rpcError } = await serviceClient.rpc('credit_stripe_session', {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_credits: credits,
    p_plan: plan,
  });

  if (rpcError) {
    console.error('[checkout-confirm] rpc error:', rpcError);
    return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
  }

  if (!credited) {
    console.log(`[checkout-confirm] session ${sessionId} already credited, skipping`);
    return NextResponse.json({ credited: true, already: true });
  }

  // Fetch updated total for response
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single();

  await serviceClient.from('credits_log').insert({
    user_id: user.id,
    delta: credits,
    reason: 'stripe_checkout',
    stripe_session_id: sessionId,
  });

  console.log(`[checkout-confirm] +${credits} credits for user ${user.id} (plan: ${plan})`);
  return NextResponse.json({ credited: true, credits, newTotal: profile?.credits ?? credits });
}
