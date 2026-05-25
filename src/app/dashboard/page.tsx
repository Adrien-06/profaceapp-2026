import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect('/?auth=login');

  const supabase = createServiceClient();
  const [{ data: profile }, { data: packs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('packs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <DashboardClient
      user={{ email: user.email ?? '', id: user.id }}
      profile={profile ?? { credits: 0 }}
      packs={packs ?? []}
    />
  );
}
