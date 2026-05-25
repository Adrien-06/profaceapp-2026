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

        // Convert file to base64 for imgbb API
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // Create URLSearchParams for imgbb API
        const imgbbFormData = new URLSearchParams();
        imgbbFormData.append('image', base64);
        imgbbFormData.append('key', IMGBB_API_KEY);
        imgbbFormData.append('expiration', '15552000'); // 180 days

        console.log(`[upload-imgbb] Sending to imgbb API...`);

        // Upload to imgbb
        const uploadRes = await fetch(IMGBB_UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: imgbbFormData.toString(),
        });

        const uploadData = await uploadRes.json() as {
            success: boolean;
            data?: {
                id: string;
                url: string;
                display_url: string;
                delete_url: string;
                expiration: number;
            };
            error?: {
                code: number;
                message: string;
            };
        };

        console.log(`[upload-imgbb] Response status: ${uploadRes.status}, success: ${uploadData.success}`);

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
            expiration: uploadData.data.expiration,
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[upload-imgbb]', msg);
        return NextResponse.json({ error: 'Upload failed: ' + msg }, { status: 500 });
    }
}

