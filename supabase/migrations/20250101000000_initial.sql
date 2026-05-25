-- ============================================================
-- ProFaceApp — initial schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text unique not null,
  full_name   text,
  credits     int not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 2. Packs table (photo generation jobs)
create table if not exists public.packs (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  prediction_id text,
  status        text not null default 'processing', -- processing | completed | failed
  photos        jsonb default '[]',
  style         text default 'boardroom',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3. Credits log (audit trail)
create table if not exists public.credits_log (
  id           bigint generated always as identity primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  delta        int not null,  -- positive = added, negative = spent
  reason       text not null, -- 'stripe_checkout' | 'generation' | 'manual'
  stripe_session_id text,
  created_at   timestamptz default now()
);

-- ============================================================
-- Functions
-- ============================================================

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

-- Trigger: run after auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Increment credits (called from Stripe webhook via service role)
create or replace function public.increment_user_credits(
  user_email  text,
  amount      int,
  session_id  text default null,
  plan        text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- get user id from email
  select id into v_user_id
  from public.profiles
  where email = user_email
  limit 1;

  if v_user_id is null then
    raise exception 'User not found: %', user_email;
  end if;

  -- add credits
  update public.profiles
  set credits = credits + amount,
      updated_at = now()
  where id = v_user_id;

  -- log it
  insert into public.credits_log (user_id, delta, reason, stripe_session_id)
  values (v_user_id, amount, 'stripe_checkout', session_id);
end;
$$;

-- Deduct 1 credit when generating (called from generate route)
create or replace function public.spend_credit(p_user_id uuid, p_pack_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set credits = credits - 1,
      updated_at = now()
  where id = p_user_id and credits >= 1;

  if not found then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credits_log (user_id, delta, reason)
  values (p_user_id, -1, 'generation');
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.packs enable row level security;
alter table public.credits_log enable row level security;

-- Profiles: users see only their own row
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Packs: users see only their own
create policy "packs_select_own"
  on public.packs for select
  using (auth.uid() = user_id);

create policy "packs_insert_own"
  on public.packs for insert
  with check (auth.uid() = user_id);

-- Credits log: users can read their own
create policy "credits_log_select_own"
  on public.credits_log for select
  using (auth.uid() = user_id);

-- ============================================================
-- Storage bucket for uploaded selfies + generated photos
-- ============================================================

insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('headshots', 'headshots', true)
on conflict do nothing;

-- Storage policies
create policy "Users upload own selfies"
  on storage.objects for insert
  with check (bucket_id = 'selfies' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users read own selfies"
  on storage.objects for select
  using (bucket_id = 'selfies' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Headshots are public"
  on storage.objects for select
  using (bucket_id = 'headshots');
