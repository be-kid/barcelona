-- Barcelona couple planner — initial schema (Supabase)
-- Apply via Supabase SQL editor or: supabase db push

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  invite_code text unique default encode(gen_random_bytes(6), 'hex'),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text,
  primary key (trip_id, user_id)
);

create table if not exists public.itineraries (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  user_id uuid references auth.users (id),
  content text not null,
  focus_day text,
  patch jsonb,
  diff_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_trip_created_idx
  on public.messages (trip_id, created_at);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.itineraries enable row level security;
alter table public.messages enable row level security;
alter table public.ai_runs enable row level security;

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

create policy "members read trips"
  on public.trips for select
  using (public.is_trip_member(id) or created_by = auth.uid());

create policy "owner insert trips"
  on public.trips for insert
  with check (auth.uid() = created_by);

create policy "members read members"
  on public.trip_members for select
  using (public.is_trip_member(trip_id));

create policy "owner manage members"
  on public.trip_members for all
  using (
    exists (
      select 1 from public.trip_members m
      where m.trip_id = trip_members.trip_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "members read itinerary"
  on public.itineraries for select
  using (public.is_trip_member(trip_id));

create policy "members update itinerary"
  on public.itineraries for update
  using (public.is_trip_member(trip_id));

create policy "members read messages"
  on public.messages for select
  using (public.is_trip_member(trip_id));

create policy "members insert user messages"
  on public.messages for insert
  with check (
    public.is_trip_member(trip_id)
    and role = 'user'
    and user_id = auth.uid()
  );

-- assistant rows: insert via Edge Function (service role), bypassing RLS

create policy "members read ai_runs"
  on public.ai_runs for select
  using (public.is_trip_member(trip_id));

-- Realtime (run once; ignore if already added)
-- alter publication supabase_realtime add table public.itineraries;
-- alter publication supabase_realtime add table public.messages;
