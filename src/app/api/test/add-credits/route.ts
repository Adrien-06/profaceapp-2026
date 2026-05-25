import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const creditsAmount = parseInt(searchParams.get('credits') || '100', 10);

  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get current profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, credits')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const newCredits = (profile.credits ?? 0) + creditsAmount;

  // Update credits
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update credits', details: updateError }, { status: 500 });
  }

  // Log the transaction
  await supabase
    .from('credits_log')
    .insert({
      user_id: userId,
      delta: creditsAmount,
      reason: 'manual_test_addition',
    });

  return NextResponse.json({
    success: true,
    user_id: userId,
    previousCredits: profile.credits,
    addedCredits: creditsAmount,
    newTotal: newCredits,
  });
}
