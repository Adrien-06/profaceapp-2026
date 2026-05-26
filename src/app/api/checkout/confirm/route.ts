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

                                                                      const { data: profile, error: profileError } = await supabase
                                                                          .from('profiles')
                                                                              .select('credits, credited_stripe_sessions')
                                                                                  .eq('id', user.id)
                                                                                      .single();

                                                                                        if (profileError || !profile) {
                                                                                            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
                                                                                              }

                                                                                                const creditedSessions: string[] = profile.credited_stripe_sessions ?? [];
                                                                                                  if (creditedSessions.includes(sessionId)) {
                                                                                                      return NextResponse.json({ credited: true, already: true });
                                                                                                        }

                                                                                                          const newCredits = (profile.credits ?? 0) + credits;
                                                                                                            const newSessions = [...creditedSessions, sessionId];

                                                                                                              const { error: updateError } = await supabase
                                                                                                                  .from('profiles')
                                                                                                                      .update({
                                                                                                                            credits: newCredits,
                                                                                                                                  credited_stripe_sessions: newSessions,
                                                                                                                                        updated_at: new Date().toISOString(),
                                                                                                                                            })
                                                                                                                                                .eq('id', user.id);

                                                                                                                                                  if (updateError) {
                                                                                                                                                      return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
                                                                                                                                                        }

                                                                                                                                                          const serviceClient = createServiceClient();
                                                                                                                                                          await serviceClient.from('credits_log').insert({
                                                                                                                                                            user_id: user.id,
                                                                                                                                                            delta: credits,
                                                                                                                                                            reason: 'stripe_checkout',
                                                                                                                                                            stripe_session_id: sessionId,
                                                                                                                                                          });

                                                                                                                                                          console.log(`[checkout-confirm] +${credits} credits for user ${user.id} (plan: ${plan}). New total: ${newCredits}`);

                                                                                                                                                            return NextResponse.json({ credited: true, credits, newTotal: newCredits });
                                                                                                                                                            }