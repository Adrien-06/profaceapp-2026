import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_email,
      customer_details: session.customer_details,
      metadata: session.metadata,
      mode: session.mode,
      status: session.status,
      amount_total: session.amount_total,
      currency: session.currency,
      created: session.created,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
