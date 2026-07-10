-- Enable Realtime for couple sync (itinerary + chat messages)
-- Run once in Supabase SQL Editor (ignore "already member of publication" if re-run)

alter publication supabase_realtime add table public.itineraries;
alter publication supabase_realtime add table public.messages;
