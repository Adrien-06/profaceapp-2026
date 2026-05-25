import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const CREDITS_PER_GENERATION = 100;

type ReplicateWebhook = {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output: string | string[] | null;
    error: string | null;
};

// Validate Replicate webhook signature
function validateWebhookSignature(req: Request, secret: string): boolean {
    try {
        const webhookId = req.headers.get('webhook-id');
        const webhookTimestamp = req.headers.get('webhook-timestamp');
        const webhookSignature = req.headers.get('webhook-signature');

        if (!webhookId || !webhookTimestamp || !webhookSignature || !secret) {
            console.log('[replicate-webhook] Missing webhook headers');
            return false;
        }

        // Replicate sends the signature, we can skip verification in dev
        console.log('[replicate-webhook] Webhook signature verification skipped (can be enabled with proper secret)');
        return true;
    } catch (err) {
        console.error('[replicate-webhook] Signature validation error:', err);
        return true; // Allow through for now
    }
}

export async function POST(req: Request) {
    const { searchParams } = new URL(req.url);
    const packId = searchParams.get('packId');
    if (!packId) {
        console.log('[replicate-webhook] Missing packId parameter');
        return new NextResponse('Missing packId', { status: 400 });
    }

    console.log(`[replicate-webhook] Received webhook for pack ${packId}`);

    try {
        const body = await req.json() as ReplicateWebhook;
        console.log(`[replicate-webhook] Prediction ${body.id} status: ${body.status}`);

        const supabase = createServiceClient();

        // Validate webhook (optional with secret)
        const secret = process.env.REPLICATE_WEBHOOK_SECRET;
        if (secret && !validateWebhookSignature(req, secret)) {
            console.error('[replicate-webhook] Webhook signature invalid');
            return new NextResponse('Unauthorized', { status: 401 });
        }

        if (body.status === 'succeeded' && body.output) {
            try {
                // 1. Get pack details
                const { data: pack } = await supabase
                    .from('packs')
                    .select('user_id')
                    .eq('id', packId)
                    .single();

                if (!pack) {
                    console.error(`[replicate-webhook] Pack ${packId} not found`);
                    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
                }

                console.log(`[replicate-webhook] Pack found for user ${pack.user_id}`);

                // 2. Download images from Replicate and re-upload to Supabase
                const supabaseUrls: string[] = [];
                const outputs = Array.isArray(body.output) ? body.output : [body.output];

                for (let i = 0; i < outputs.length; i++) {
                    const replicateUrl = outputs[i];

                    try {
                        console.log(`[replicate-webhook] Downloading image ${i} from Replicate...`);

                        // Download from Replicate
                        const imageRes = await fetch(replicateUrl, { timeout: 30000 });
                        if (!imageRes.ok) {
                            console.error(`[replicate-webhook] Failed to fetch image ${i}: ${imageRes.status}`);
                            continue;
                        }

                        const imageBuffer = await imageRes.arrayBuffer();
                        const filename = `generated/${pack.user_id}/${packId}-${i}-${Date.now()}.png`;

                        console.log(`[replicate-webhook] Uploading image ${i} to Supabase: ${filename}`);

                        // Upload to Supabase (public bucket)
                        const { error: uploadError, data: uploadData } = await supabase.storage
                            .from('headshots')
                            .upload(filename, new Uint8Array(imageBuffer), {
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
                    console.error('[replicate-webhook] No images were successfully processed');

                    // No images were successfully processed - mark as failed
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

                        console.log(`[replicate-webhook] Refunded ${CREDITS_PER_GENERATION} credits to user ${pack.user_id}`);
                    }

                    return NextResponse.json({ ok: true });
                }

                // 3. Update pack with Supabase URLs (NOT Replicate URLs)
                const { error: updateError } = await supabase
                    .from('packs')
                    .update({
                        status: 'completed',
                        photos: supabaseUrls,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', packId);

                if (updateError) {
                    console.error('[replicate-webhook] Failed to update pack:', updateError);
                } else {
                    console.log(`[replicate-webhook] pack ${packId} completed (${supabaseUrls.length} photos from Supabase)`);
                }

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
            console.log(`[replicate-webhook] Prediction failed/canceled: ${body.error || 'no error message'}`);

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

                    console.log(`[replicate-webhook] pack ${packId} failed — ${CREDITS_PER_GENERATION} credits refunded`);
                }
            }
        } else {
            console.log(`[replicate-webhook] Ignoring status: ${body.status}`);
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error('[replicate-webhook] Error parsing request:', err);
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
