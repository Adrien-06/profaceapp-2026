import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export async function POST(req: Request) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('[stripe-webhook] verification failed:', msg);
    return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object as Stripe.Checkout.Session;
    const email    = session.customer_details?.email ?? session.metadata?.user_email;
    const plan     = session.metadata?.plan;
    const credits  = parseInt(session.metadata?.credits ?? '0', 10);

    if (!email || !credits) {
      console.error('[stripe-webhook] missing email or credits in session', session.id);
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.rpc('increment_user_credits', {
      user_email: email,
      amount:     credits,
      session_id: session.id,
      plan,
    });

    if (error) {
      console.error('[stripe-webhook] supabase rpc error:', error);
      return new NextResponse('Database error', { status: 500 });
    }

    console.log(`[stripe-webhook] +${credits} credits → ${email} (plan: ${plan})`);
  }

  return NextResponse.json({ received: true });
}
