-- Fix spend_credit function to accept amount parameter
create or replace function public.spend_credit(
  p_user_id uuid,
  p_pack_id uuid,
  p_amount int default 1
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set credits = credits - p_amount,
      updated_at = now()
  where id = p_user_id and credits >= p_amount;

  if not found then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credits_log (user_id, delta, reason)
  values (p_user_id, -p_amount, 'generation');
end;
$$;
