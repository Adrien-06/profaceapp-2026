import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const packId = id;

    const adminClient = createServiceClient();
    const { data: pack, error } = await adminClient
      .from('packs')
      .select('id, user_id, status, photos, created_at, updated_at')
      .eq('id', packId)
      .eq('user_id', user.id)
      .single();

    if (error || !pack) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }

    return NextResponse.json(pack);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[get-pack]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
