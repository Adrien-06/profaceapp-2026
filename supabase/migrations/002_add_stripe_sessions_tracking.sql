-- Add column to track credited Stripe sessions (prevent duplicate credits)
alter table public.profiles
add column if not exists credited_stripe_sessions text[] default '{}';

-- Create an index for faster lookups if needed
create index if not exists idx_profiles_id_credited_sessions
  on public.profiles(id, credited_stripe_sessions);
