import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const CREDITS_PER_GENERATION = 100;

type ReplicateWebhook = {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output: string[] | null;
    error: string | null;
};

export async function POST(req: Request) {
    const { searchParams } = new URL(req.url);
    const packId = searchParams.get('packId');
    if (!packId) return new NextResponse('Missing packId', { status: 400 });

  const body = await req.json() as ReplicateWebhook;
    const supabase = createServiceClient();

  if (body.status === 'succeeded' && body.output?.length) {
        await supabase
          .from('packs')
          .update({ status: 'completed', photos: body.output, updated_at: new Date().toISOString() })
          .eq('id', packId);

      console.log(`[replicate-webhook] pack ${packId} completed (${body.output.length} photos)`);
  } else if (body.status === 'failed' || body.status === 'canceled') {
        // Fetch pack to get user_id
      const { data: pack } = await supabase
          .from('packs')
          .select('user_id')
          .eq('id', packId)
          .single();

      await supabase
          .from('packs')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', packId);

      if (pack?.user_id) {
              // Refund 3 credits (same amount that was deducted)
          const { data: profile } = await supabase
                .from('profiles')
                .select('credits')
                .eq('id', pack.user_id)
                .single();

          if (profile) {
                    await supabase
                      .from('profiles')
                      .update({ credits: profile.credits + CREDITS_PER_GENERATION, updated_at: new Date().toISOString() })
                      .eq('id', pack.user_id);

                await supabase
                      .from('credits_log')
                      .insert({ user_id: pack.user_id, delta: CREDITS_PER_GENERATION, reason: 'refund_failed_generation', pack_id: packId });
          }
      }

      console.log(`[replicate-webhook] pack ${packId} failed — ${CREDITS_PER_GENERATION} credits refunded`);
  }

  return NextResponse.json({ ok: true });
}
