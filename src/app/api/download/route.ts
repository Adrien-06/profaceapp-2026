import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Proxy route: /api/download?url=<encoded_image_url>
 * - Verifies the user is authenticated
 * - Fetches the image server-side (Supabase storage or fal.ai)
 * - Streams it back so the source URL is never exposed to the browser
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const imageUrl = searchParams.get('url');
        if (!imageUrl) {
            return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
        }

        // Only allow our own Supabase storage or fal.ai delivery URLs
        const allowed = ['.supabase.co', '.fal.media', 'fal.media', '.fal.ai'];
        const parsedUrl = new URL(imageUrl);
        const isAllowed = allowed.some(domain => parsedUrl.hostname.endsWith(domain));
        if (!isAllowed) {
            return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
        }

        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
        }

        const contentType = imageRes.headers.get('content-type') ?? 'image/png';
        const buffer = await imageRes.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': 'attachment; filename="headshot.png"',
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[download-proxy]', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
