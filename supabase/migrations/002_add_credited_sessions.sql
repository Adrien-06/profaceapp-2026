-- Add column to track which Stripe sessions have already credited a user
alter table public.profiles add column if not exists credited_stripe_sessions text[] default '{}';
