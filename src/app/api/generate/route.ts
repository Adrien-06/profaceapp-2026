import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageUrls } = await req.json() as { imageUrls: string[] };
    if (!imageUrls?.length) return NextResponse.json({ error: 'No image URLs provided' }, { status: 400 });

    const adminClient = createServiceClient();

    // Check credits
    const { data: profile } = await adminClient
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (!profile || profile.credits < 1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Create pack record
    const { data: pack, error: packError } = await adminClient
      .from('packs')
      .insert({ user_id: user.id, status: 'processing' })
      .select()
      .single();

    if (packError || !pack) {
      return NextResponse.json({ error: 'Failed to create pack' }, { status: 500 });
    }

    // Deduct credit atomically
    const { error: creditError } = await adminClient.rpc('spend_credit', {
      p_user_id: user.id,
      p_pack_id: pack.id,
    });

    if (creditError) {
      await adminClient.from('packs').delete().eq('id', pack.id);
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // Start Replicate prediction
    const prediction = await replicate.predictions.create({
      version: 'a86243a41767d4f3b0e3633d9e29a8a7db324bca81a9437cf339d2c67623a846',
      input: {
        image: imageUrls[0],
        prompt: 'A professional corporate headshot, sharp suit, office environment, 8k resolution, photorealistic',
        negative_prompt: 'ugly, blurry, bad anatomy, casual clothes',
        num_outputs: 3,
      },
      webhook: `${appUrl}/api/webhooks/replicate?packId=${pack.id}`,
      webhook_events_filter: ['completed'],
    });

    // Store prediction id
    await adminClient
      .from('packs')
      .update({ prediction_id: prediction.id })
      .eq('id', pack.id);

    return NextResponse.json({ packId: pack.id, predictionId: prediction.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
