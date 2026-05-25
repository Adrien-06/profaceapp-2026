import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const CREDITS_PER_GENERATION = 100;

const HEADSHOT_PROMPT =
    'A professional corporate three-quarter right studio portrait from this selfie, arms crossed, torso position slightly turned on his/her right side, looking directly into the camera with Maintaining the natural mouth shape with slight smile and exact facial expression from the reference image. No added teeth, no exaggerated smile. Wearing a premium tailored matt black business suit with a crisp white shirt. Shot on a high-end medium format camera, 85mm lens, f/2.8 aperture, The lighting is soft and directional (clamshell or light Rembrandt style) against a plain medium united #3D3A3A dark charcoal background. The focus is sharp on her face, with a shallow depth of field. we can see the body to below arms. High-quality corporate portrait photography style Photorealistic, hyper-detailed skin texture, pores, individual hair strands, no too much light reflect on skin or glasses or hair or clothes. high-resolution 8k, commercial advertising photography style.';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { imageUrls } = await req.json() as { imageUrls: string[] };
        if (!imageUrls?.length) return NextResponse.json({ error: 'No image URLs provided' }, { status: 400 });

        const adminClient = createServiceClient();

        // 1. Check credits
        const { data: profile } = await adminClient
            .from('profiles')
            .select('credits')
            .eq('id', user.id)
            .single();

        if (!profile || profile.credits < CREDITS_PER_GENERATION) {
            return NextResponse.json({ error: 'Insufficient credits. You need at least 100 credits to generate a photo.' }, { status: 402 });
        }

        // 2. Create pack in processing status
        const { data: folder } = await adminClient
            .from('folders')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', 'My Folders')
            .single();

        const { data: pack, error: packError } = await adminClient
            .from('packs')
            .insert({ user_id: user.id, status: 'processing', folder_id: folder?.id })
            .select()
            .single();

        if (packError || !pack) {
            return NextResponse.json({ error: 'Failed to create pack' }, { status: 500 });
        }

        // 3. Deduct credits atomically
        const { error: creditError } = await adminClient.rpc('spend_credit', {
            p_user_id: user.id,
            p_pack_id: pack.id,
            p_amount: CREDITS_PER_GENERATION,
        });

        if (creditError) {
            console.error('[generate] RPC error:', creditError);
            // Fallback: manual deduction if RPC fails
            const { error: manualError } = await adminClient
                .from('profiles')
                .update({ credits: profile.credits - CREDITS_PER_GENERATION, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (manualError) {
                console.error('[generate] Manual deduction failed:', manualError);
                await adminClient.from('packs').delete().eq('id', pack.id);
                return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
            }

            // Log the deduction
            const { error: logError } = await adminClient
                .from('credits_log')
                .insert({ user_id: user.id, delta: -CREDITS_PER_GENERATION, reason: 'generation', pack_id: pack.id });

            if (logError) {
                console.error('[generate] Log error:', logError);
            }
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://profaceapp.com';

        // 4. Call Replicate with FLUX-2-DEV (supports Image-to-Image)
        const prediction = await replicate.predictions.create({
            model: 'black-forest-labs/flux-2-dev',
            input: {
                prompt: HEADSHOT_PROMPT,
                input_images: [imageUrls[0]],
                aspect_ratio: 'match_input_image',
                output_format: 'png',
                output_quality: 90,
            },
            webhook: `${appUrl}/api/webhooks/replicate?packId=${pack.id}`,
            webhook_events_filter: ['completed'],
        });

        // 5. Store prediction ID (never exposed to frontend)
        await adminClient
            .from('packs')
            .update({ prediction_id: prediction.id })
            .eq('id', pack.id);

        console.log(`[generate] Created pack ${pack.id} for user ${user.id}, prediction ${prediction.id}, deducted ${CREDITS_PER_GENERATION} credits`);

        // 🛑 SECURITY: Return only packId (Replicate URL never exposed)
        return NextResponse.json({ packId: pack.id });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[generate]', msg);
        return NextResponse.json({ error: 'Generation failed to initialize' }, { status: 500 });
    }
}
