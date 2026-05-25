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
        try {
            // 1. Get pack details
            const { data: pack } = await supabase
                .from('packs')
                .select('user_id')
                .eq('id', packId)
                .single();

            if (!pack) {
                return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
            }

            // 2. Download images from Replicate and re-upload to Supabase
            const supabaseUrls: string[] = [];

            for (let i = 0; i < body.output.length; i++) {
                const replicateUrl = body.output[i];

                try {
                    // Download from Replicate
                    const imageRes = await fetch(replicateUrl);
                    if (!imageRes.ok) {
                        console.error(`[replicate-webhook] Failed to fetch image ${i} from Replicate`);
                        continue;
                    }

                    const imageBuffer = await imageRes.arrayBuffer();
                    const filename = `generated/${pack.user_id}/${packId}-${i}-${Date.now()}.png`;

                    // Upload to Supabase (public bucket)
                    const { error: uploadError } = await supabase.storage
                        .from('headshots')
                        .upload(filename, imageBuffer, {
                            contentType: 'image/png',
                            upsert: false,
                        });

                    if (uploadError) {
                        console.error(`[replicate-webhook] Upload error for image ${i}:`, uploadError);
                        continue;
                    }

                    // Get public URL from Supabase (NEVER expose Replicate URL)
                    const { data: publicUrl } = supabase.storage
                        .from('headshots')
                        .getPublicUrl(filename);

                    supabaseUrls.push(publicUrl.publicUrl);
                    console.log(`[replicate-webhook] Image ${i} saved to Supabase: ${filename}`);

                } catch (err) {
                    console.error(`[replicate-webhook] Error processing image ${i}:`, err);
                }
            }

            if (supabaseUrls.length === 0) {
                // No images were successfully processed
                await supabase
                    .from('packs')
                    .update({ status: 'failed', updated_at: new Date().toISOString() })
                    .eq('id', packId);

                // Refund credits
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('credits')
                    .eq('id', pack.user_id)
                    .single();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ credits: profile.credits + CREDITS_PER_GENERATION })
                        .eq('id', pack.user_id);

                    await supabase
                        .from('credits_log')
                        .insert({
                            user_id: pack.user_id,
                            delta: CREDITS_PER_GENERATION,
                            reason: 'refund_failed_generation',
                            pack_id: packId,
                        });
                }

                return NextResponse.json({ ok: true });
            }

            // 3. Update pack with Supabase URLs (NOT Replicate URLs)
            await supabase
                .from('packs')
                .update({
                    status: 'completed',
                    photos: supabaseUrls,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', packId);

            console.log(`[replicate-webhook] pack ${packId} completed (${supabaseUrls.length} photos from Supabase)`);

        } catch (err) {
            console.error('[replicate-webhook] Error processing completed pack:', err);

            // Mark as failed on error
            await supabase
                .from('packs')
                .update({ status: 'failed', updated_at: new Date().toISOString() })
                .eq('id', packId);

            return NextResponse.json({ error: 'Processing error' }, { status: 500 });
        }

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
            // Refund credits on failure
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
                    .insert({
                        user_id: pack.user_id,
                        delta: CREDITS_PER_GENERATION,
                        reason: 'refund_failed_generation',
                        pack_id: packId,
                    });
            }
        }

        console.log(`[replicate-webhook] pack ${packId} failed — ${CREDITS_PER_GENERATION} credits refunded`);
    }

    return NextResponse.json({ ok: true });
}
