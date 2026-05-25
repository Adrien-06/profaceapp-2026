import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 'bd8725da43e3b4ee0bc7fd0e5741723f';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('image') as File;

        if (!file) {
            return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
        }

        if (file.size > 32 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image too large (max 32MB)' }, { status: 400 });
        }

        console.log(`[upload-imgbb] Uploading image for user ${user.id}, size: ${file.size} bytes, type: ${file.type}`);

        // Convert to base64 (matches Python: base64.b64encode(buffered.getvalue()).decode())
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        console.log(`[upload-imgbb] Base64 encoded, length: ${base64.length} chars`);

        // API key in URL, image as base64 in body (matches Python: payload = {"key": key, "image": img_str})
        const uploadUrl = `${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`;
        const body = `image=${encodeURIComponent(base64)}`;

        console.log(`[upload-imgbb] Sending to imgbb API, body size: ${body.length} chars...`);

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });

        const responseText = await uploadRes.text();
        console.log(`[upload-imgbb] Response status: ${uploadRes.status}, body: ${responseText.substring(0, 200)}`);

        const uploadData = JSON.parse(responseText) as {
            success: boolean;
            data?: {
                id: string;
                url: string;
                display_url: string;
                delete_url: string;
            };
            error?: {
                code: number;
                message: string;
            };
        };

        if (!uploadData.success || !uploadData.data?.url) {
            const errorMsg = uploadData.error?.message || 'Unknown error';
            console.error('[upload-imgbb] imgbb error:', errorMsg);
            return NextResponse.json(
                { error: `imgbb upload failed: ${errorMsg}` },
                { status: 400 }
            );
        }

        const imageUrl = uploadData.data.url;
        console.log(`[upload-imgbb] Image uploaded successfully: ${imageUrl}`);

        return NextResponse.json({
            url: imageUrl,
            display_url: uploadData.data.display_url,
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[upload-imgbb]', msg);
        return NextResponse.json({ error: 'Upload failed: ' + msg }, { status: 500 });
    }
}

