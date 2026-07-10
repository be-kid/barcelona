-- Fix invite join: case-insensitive code + users can read own membership row

-- Own row readable immediately after join (avoids RLS edge cases)
drop policy if exists "users read own membership" on public.trip_members;
create policy "users read own membership"
  on public.trip_members for select
  using (user_id = auth.uid());

create or replace function public.join_trip_with_invite(
  p_trip_id uuid,
  p_invite_code text,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_code text := lower(trim(p_invite_code));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if v_code = '' then
    raise exception 'invite code required';
  end if;

  if not exists (
    select 1
    from public.trips
    where id = p_trip_id
      and lower(trim(invite_code)) = v_code
  ) then
    raise exception 'invalid invite code (trip id or code mismatch)';
  end if;

  if exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
  ) then
    return;
  end if;

  select count(*) into v_count
  from public.trip_members
  where trip_id = p_trip_id;

  if v_count >= 2 then
    raise exception 'trip is full';
  end if;

  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (
    p_trip_id,
    auth.uid(),
    'member',
    coalesce(
      nullif(trim(p_display_name), ''),
      split_part(coalesce(auth.jwt()->>'email', 'guest'), '@', 1)
    )
  );
end;
$$;

revoke all on function public.join_trip_with_invite(uuid, text, text) from public;
grant execute on function public.join_trip_with_invite(uuid, text, text) to authenticated;
