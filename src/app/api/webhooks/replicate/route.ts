import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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
    // Mark failed and refund 1 credit directly
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
      // Refund: increment credits by 1
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', pack.user_id)
        .single();

      if (profile) {
        await supabase
          .from('profiles')
          .update({ credits: profile.credits + 1, updated_at: new Date().toISOString() })
          .eq('id', pack.user_id);

        await supabase
          .from('credits_log')
          .insert({ user_id: pack.user_id, delta: 1, reason: 'refund_failed_generation' });
      }
    }

    console.log(`[replicate-webhook] pack ${packId} failed — credit refunded`);
  }

  return NextResponse.json({ ok: true });
}
