import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// fal.ai keys are sometimes pasted with surrounding quotes/whitespace in the
// hosting dashboard — strip them so the Authorization header is well-formed.
const FAL_KEY = (process.env.FAL_KEY ?? '').trim().replace(/^["']|["']$/g, '');

const CREDITS_PER_GENERATION = 10;

const HEADSHOT_PROMPT =
    'A professional corporate three-quarter right studio portrait from this selfie, arms crossed, torso position slightly turned on his/her right side, looking directly into the camera with Maintaining the natural mouth shape with slight smile and exact facial expression from the reference image. No added teeth, no exaggerated smile. Wearing a premium tailored matt black business suit with a crisp white shirt. Shot on a high-end medium format camera, 85mm lens, f/2.8 aperture, The lighting is soft and directional (clamshell or light Rembrandt style) against a plain medium united #3D3A3A dark charcoal background. The focus is sharp on her face, with a shallow depth of field. we can see the body to below arms. High-quality corporate portrait photography style Photorealistic, hyper-detailed skin texture, pores, individual hair strands, no too much light reflect on skin or glasses or hair or clothes. high-resolution 8k, commercial advertising photography style.';

type FalEditOutput = {
    images?: { url: string }[];
    seed?: number;
};

export async function POST(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { selfiePath } = await req.json() as { selfiePath?: string };
    if (!selfiePath) return NextResponse.json({ error: 'No selfie provided' }, { status: 400 });

    // The selfie must belong to the requesting user (path = "<userId>/<file>")
    if (!selfiePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Invalid selfie path' }, { status: 403 });
    }

    // Fail fast (before touching credits) if the fal.ai key is missing
    if (!FAL_KEY) {
        console.error('[generate] FAL_KEY is not set in the environment');
        return NextResponse.json(
            { error: 'Image generation is temporarily unavailable. Please try again later.' },
            { status: 503 },
        );
    }
    fal.config({ credentials: FAL_KEY });

    const admin = createServiceClient();

    // 1. Check credits (minimum 10 required)
    const { data: profile } = await admin
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

    if (!profile || profile.credits < CREDITS_PER_GENERATION) {
        return NextResponse.json(
            { error: 'Insufficient credits. You need at least 10 credits to generate a photo.' },
            { status: 402 },
        );
    }

    // 2. Create a signed URL so fal.ai can fetch the private selfie
    const { data: signed, error: signErr } = await admin
        .storage
        .from('selfies')
        .createSignedUrl(selfiePath, 60 * 10);

    if (signErr || !signed?.signedUrl) {
        return NextResponse.json({ error: 'Could not access uploaded selfie' }, { status: 500 });
    }

    // 3. Create pack record
    const { data: pack, error: packError } = await admin
        .from('packs')
        .insert({ user_id: user.id, status: 'processing' })
        .select()
        .single();

    if (packError || !pack) {
        return NextResponse.json({ error: 'Failed to create pack' }, { status: 500 });
    }

    // 4. Deduct 10 credits atomically
    const { error: spendErr } = await admin
        .from('profiles')
        .update({ credits: profile.credits - CREDITS_PER_GENERATION, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .gte('credits', CREDITS_PER_GENERATION);

    if (spendErr) {
        await admin.from('packs').delete().eq('id', pack.id);
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    await admin
        .from('credits_log')
        .insert({ user_id: user.id, delta: -CREDITS_PER_GENERATION, reason: 'generation' });

    // Helper: refund credits + mark pack failed if anything below goes wrong
    const failAndRefund = async (message: string) => {
        await admin
            .from('profiles')
            .update({ credits: profile.credits, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        await admin
            .from('credits_log')
            .insert({ user_id: user.id, delta: CREDITS_PER_GENERATION, reason: 'refund_failed_generation' });
        await admin
            .from('packs')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', pack.id);
        console.error('[generate]', message);
    };

    try {
        // 5. Run Flux 2 Pro edit (img → img) on fal.ai, waiting for the result
        const result = await fal.subscribe('fal-ai/flux-2-pro/edit', {
            input: {
                prompt: HEADSHOT_PROMPT,
                image_size: 'portrait_4_3',
                safety_tolerance: '1',
                enable_safety_checker: true,
                output_format: 'png',
                image_urls: [signed.signedUrl],
            },
            logs: false,
        });

        const data = result.data as FalEditOutput;
        const outputUrl = data?.images?.[0]?.url;
        if (!outputUrl) {
            await failAndRefund('fal.ai returned no image');
            return NextResponse.json({ error: 'Generation failed', packId: pack.id }, { status: 502 });
        }

        // 6. Download the generated image and store it in the public "headshots" bucket
        const imgRes = await fetch(outputUrl);
        if (!imgRes.ok) {
            await failAndRefund(`Failed to download fal.ai output (${imgRes.status})`);
            return NextResponse.json({ error: 'Generation failed', packId: pack.id }, { status: 502 });
        }
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        const storagePath = `${user.id}/${pack.id}.png`;

        const { error: uploadErr } = await admin
            .storage
            .from('headshots')
            .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });

        if (uploadErr) {
            await failAndRefund(`Storage upload failed: ${uploadErr.message}`);
            return NextResponse.json({ error: 'Could not save photo', packId: pack.id }, { status: 500 });
        }

        const { data: pub } = admin.storage.from('headshots').getPublicUrl(storagePath);
        const photoUrl = pub.publicUrl;

        // 7. Mark pack completed
        await admin
            .from('packs')
            .update({ status: 'completed', photos: [photoUrl], updated_at: new Date().toISOString() })
            .eq('id', pack.id);

        return NextResponse.json({ packId: pack.id, photos: [photoUrl] });
    } catch (err: unknown) {
        // fal.ai client errors carry a status + body with the real reason
        const e = err as { status?: number; message?: string; body?: unknown };
        const status = e?.status;
        const detail = e?.body ? JSON.stringify(e.body) : (e?.message ?? 'Unknown error');
        await failAndRefund(`fal.ai error (status ${status ?? '?'}): ${detail}`);

        // 401/403 mean the FAL_KEY is missing/invalid/unauthorized on fal.ai
        const userMessage = status === 401 || status === 403
            ? 'Image generation service rejected the request (authentication). Please contact support.'
            : 'Generation failed. Please try again.';
        return NextResponse.json({ error: userMessage, packId: pack.id }, { status: 502 });
    }
}
