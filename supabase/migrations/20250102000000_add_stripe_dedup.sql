-- ============================================================
-- Add stripe session deduplication to prevent double-crediting
-- ============================================================

-- Create table to track which Stripe sessions have been credited
create table if not exists public.stripe_credited_sessions (
  session_id   text primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  credits      int not null,
  created_at   timestamptz default now()
);

-- Create function to atomically claim a stripe session
-- Returns true if this is the first caller (credits applied), false if already credited
create or replace function public.credit_stripe_session(
  p_session_id text,
  p_user_id    uuid,
  p_credits    int,
  p_plan       text default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_inserted boolean;
begin
  -- Try to insert; if session_id already exists, do nothing (ON CONFLICT DO NOTHING)
  insert into public.stripe_credited_sessions (session_id, user_id, credits)
  values (p_session_id, p_user_id, p_credits)
  on conflict (session_id) do nothing;

  -- Check if we just inserted (session didn't exist before)
  if found then
    -- We inserted, so this is the first caller — apply credits
    update public.profiles
    set credits = credits + p_credits,
        updated_at = now()
    where id = p_user_id;

    -- Log the transaction
    insert into public.credits_log (user_id, delta, reason, stripe_session_id)
    values (p_user_id, p_credits, 'stripe_checkout', p_session_id);

    return true; -- Indicate we applied credits
  else
    -- Session already credited, skip
    return false; -- Indicate we skipped (already credited)
  end if;
end;
$$;

-- Enable RLS on the new table
alter table public.stripe_credited_sessions enable row level security;

-- Service role can always access (for webhooks)
-- Users cannot access this table
create policy "stripe_sessions_service_only"
  on public.stripe_credited_sessions
  for all
  using (false)
  with check (false);
