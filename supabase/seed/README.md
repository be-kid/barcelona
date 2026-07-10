-- Seed a demo trip from local itinerary JSON.
-- 1) Create two users via Auth (magic link / email)
-- 2) Replace OWNER_UUID / MEMBER_UUID
-- 3) Paste itinerary JSON into data below (or use scripts/seed_trip.sql generator)

-- Example after users exist:
-- select id, email from auth.users;

insert into public.trips (id, slug, title, created_by)
values (
  '11111111-1111-1111-1111-111111111111',
  'barcelona-2026',
  '바르셀로나 5박 6일',
  'OWNER_UUID'
)
on conflict (slug) do nothing;

insert into public.trip_members (trip_id, user_id, role, display_name)
values
  ('11111111-1111-1111-1111-111111111111', 'OWNER_UUID', 'owner', '나'),
  ('11111111-1111-1111-1111-111111111111', 'MEMBER_UUID', 'member', '여친')
on conflict do nothing;

-- itineraries.data: copy from data/itinerary.json
-- insert into public.itineraries (trip_id, data, version)
-- values ('11111111-1111-1111-1111-111111111111', '{...}'::jsonb, 1);
