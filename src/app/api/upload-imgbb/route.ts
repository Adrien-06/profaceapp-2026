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

        console.log(`[upload-imgbb] Uploading image for user ${user.id}, size: ${file.size} bytes`);

        // Create FormData for imgbb
        const imgbbFormData = new FormData();
        imgbbFormData.append('image', file);
        imgbbFormData.append('key', IMGBB_API_KEY);

        // Upload to imgbb
        const uploadRes = await fetch(IMGBB_UPLOAD_URL, {
            method: 'POST',
            body: imgbbFormData,
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            console.error('[upload-imgbb] imgbb error:', uploadRes.status, errorText);
            return NextResponse.json(
                { error: `imgbb upload failed: ${uploadRes.status}` },
                { status: uploadRes.status }
            );
        }

        const imgbbResult = await uploadRes.json() as {
            success: boolean;
            data?: {
                url: string;
                display_url: string;
                delete_url: string;
            };
            error?: {
                message: string;
            };
        };

        if (!imgbbResult.success || !imgbbResult.data?.url) {
            console.error('[upload-imgbb] imgbb success false:', imgbbResult);
            return NextResponse.json(
                { error: 'imgbb upload failed: ' + (imgbbResult.error?.message || 'unknown error') },
                { status: 400 }
            );
        }

        const imageUrl = imgbbResult.data.url;
        console.log(`[upload-imgbb] Image uploaded to imgbb: ${imageUrl}`);

        return NextResponse.json({
            url: imageUrl,
            display_url: imgbbResult.data.display_url,
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[upload-imgbb]', msg);
        return NextResponse.json({ error: 'Upload failed: ' + msg }, { status: 500 });
    }
}
