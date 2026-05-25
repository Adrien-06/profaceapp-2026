-- ============================================================
-- ProFaceApp — Add folders system and fix credits
-- ============================================================

-- 0a. Add pack_id column to credits_log if missing
alter table public.credits_log add column if not exists pack_id uuid references public.packs(id) on delete set null;

-- 0b. Add credited_stripe_sessions column to profiles if missing
alter table public.profiles add column if not exists credited_stripe_sessions text[] default '{}' not null;

-- 1. Create folders table for organizing generated photos
create table if not exists public.folders (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  name          text not null,
  description   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, name)
);

-- 2. Create default "My Folders" folder for each user
create or replace function public.create_default_folder()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.folders (user_id, name, description)
  values (new.id, 'My Folders', 'Your generated photos');
  return new;
end;
$$;

drop trigger if exists on_new_user_create_folder on public.profiles;
create trigger on_new_user_create_folder
  after insert on public.profiles
  for each row execute procedure public.create_default_folder();

-- 3. Add folder_id to packs table
alter table public.packs add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- 4. Update spend_credit function to handle 100 credits correctly
create or replace function public.spend_credit(p_user_id uuid, p_pack_id uuid, p_amount int default 100)
returns void
language plpgsql
security definer
as $$
declare
  v_current_credits int;
begin
  -- Get current credits
  select credits into v_current_credits
  from public.profiles
  where id = p_user_id;

  if v_current_credits < p_amount then
    raise exception 'Insufficient credits';
  end if;

  -- Deduct credits
  update public.profiles
  set credits = credits - p_amount,
      updated_at = now()
  where id = p_user_id;

  -- Log the transaction
  insert into public.credits_log (user_id, delta, reason, pack_id)
  values (p_user_id, -p_amount, 'generation', p_pack_id);
end;
$$;

-- 5. Row Level Security for folders
alter table public.folders enable row level security;

create policy "folders_select_own"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "folders_insert_own"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "folders_update_own"
  on public.folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "folders_delete_own"
  on public.folders for delete
  using (auth.uid() = user_id);
