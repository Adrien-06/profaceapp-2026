import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const CREDITS_PER_GENERATION = 3;

const HEADSHOT_PROMPT =
    'A professional corporate commercial headshot of a from this selfie, arms crossed, torso position slightly turned, looking directly into the camera with Maintaining the natural mouth shape with slight smile and exact facial expression from the reference image. No added teeth, no exaggerated smile. Wearing a premium tailored charcoal gray business suit with a crisp white shirt. Shot on a high-end medium format camera, 85mm lens, f/2.8 aperture, creating a soft cinematic bokeh. Clean, Sophisticated premium soft office background with a cinematic bokeh blur, softly blurred with natural window light and subtle corporate premium interior details. Professional studio lighting cinema style, soft key light, subtle rim light to separate the subject from the background. Photorealistic, hyper-detailed skin texture, with slightly smoothing out the imperfections, individual hair strands, high-resolution 8k, commercial advertising photography style.';

export async function POST(req: Request) {
    try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const { imageUrls } = await req.json() as { imageUrls: string[] };
          if (!imageUrls?.length) return NextResponse.json({ error: 'No image URLs provided' }, { status: 400 });

      const adminClient = createServiceClient();

      // Check credits (minimum 3 required)
      const { data: profile } = await adminClient
            .from('profiles')
            .select('credits')
            .eq('id', user.id)
            .single();

      if (!profile || profile.credits < CREDITS_PER_GENERATION) {
              return NextResponse.json({ error: 'Insufficient credits. You need at least 3 credits to generate a photo.' }, { status: 402 });
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

      // Deduct 3 credits atomically
      const { error: creditError } = await adminClient.rpc('spend_credit', {
              p_user_id: user.id,
              p_pack_id: pack.id,
              p_amount: CREDITS_PER_GENERATION,
      });

      if (creditError) {
              // Fallback: manual deduction if RPC does not support p_amount
            const { error: manualError } = await adminClient
                .from('profiles')
                .update({ credits: profile.credits - CREDITS_PER_GENERATION, updated_at: new Date().toISOString() })
                .eq('id', user.id)
                .gte('credits', CREDITS_PER_GENERATION);

            if (manualError) {
                      await adminClient.from('packs').delete().eq('id', pack.id);
                      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
            }

            await adminClient
                .from('credits_log')
                .insert({ user_id: user.id, delta: -CREDITS_PER_GENERATION, reason: 'generation', pack_id: pack.id });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

      // Start Replicate prediction with flux-2-pro
      const prediction = await replicate.predictions.create({
              model: 'black-forest-labs/flux-2-pro',
              input: {
                        prompt: HEADSHOT_PROMPT,
                        resolution: '1 MP',
                        aspect_ratio: '3:4',
                        input_images: [imageUrls[0]],
                        output_format: 'png',
                        output_quality: 80,
                        safety_tolerance: 1,
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
