-- Fix: infinite recursion on trip_members RLS
-- Cause: policies on trip_members called is_trip_member() / subquery on trip_members again.

drop policy if exists "members read members" on public.trip_members;
drop policy if exists "owner manage members" on public.trip_members;

drop policy if exists "users read own membership" on public.trip_members;
create policy "users read own membership"
  on public.trip_members for select
  to authenticated
  using (user_id = auth.uid());

-- is_trip_member: used on itineraries/messages/trips — NOT on trip_members policies
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- trip_members insert/update: only via security definer RPC (join_trip_with_invite) or SQL editor
