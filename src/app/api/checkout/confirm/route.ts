import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

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

  // Get user from auth cookies to ensure they're logged in
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  // For subscriptions, check session.status === 'complete' (payment may not be 'paid' yet)
  // For one-time payments, also accept 'complete' status
  if (session.status !== 'complete') {
    console.log(`[checkout-confirm] session not complete: ${session.id}, status: ${session.status}`);
    return NextResponse.json({ credited: false, reason: 'not_complete' });
  }

  const plan = session.metadata?.plan ?? 'starter';
  const credits = parseInt(session.metadata?.credits ?? '0', 10) || PLAN_CREDITS[plan] || 0;

  if (!credits) {
    return NextResponse.json({ error: 'No credits to add' }, { status: 400 });
  }

  // Use service client to bypass RLS (we've already verified user is logged in above)
  const serviceClient = createServiceClient();
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('credits, credited_stripe_sessions')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[checkout-confirm] profile error:', profileError);
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const creditedSessions: string[] = profile.credited_stripe_sessions ?? [];
  if (creditedSessions.includes(sessionId)) {
    console.log(`[checkout-confirm] session ${sessionId} already credited`);
    return NextResponse.json({ credited: true, already: true });
  }

  const newCredits = (profile.credits ?? 0) + credits;
  const newSessions = [...creditedSessions, sessionId];

  const { error: updateError } = await serviceClient
    .from('profiles')
    .update({
      credits: newCredits,
      credited_stripe_sessions: newSessions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('[checkout-confirm] update error:', updateError);
    return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
  }

  console.log(`[checkout-confirm] +${credits} credits for user ${user.id} (plan: ${plan}, session: ${sessionId}). New total: ${newCredits}`);

  return NextResponse.json({ credited: true, credits, newTotal: newCredits });
}
