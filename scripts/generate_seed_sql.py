#!/usr/bin/env python3
"""Generate SQL seed for itineraries.data from data/itinerary.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ITIN = ROOT / "data" / "itinerary.json"
OUT = ROOT / "supabase" / "seed" / "002_itinerary_data.sql"
TRIP_ID = "11111111-1111-1111-1111-111111111111"


def main() -> None:
    data = json.loads(ITIN.read_text(encoding="utf-8"))
    payload = json.dumps(data, ensure_ascii=False).replace("'", "''")
    sql = f"""-- Auto-generated from data/itinerary.json
-- Run in Supabase SQL Editor (trips row required before itineraries FK)

insert into public.trips (id, slug, title)
values (
  '{TRIP_ID}',
  'barcelona-2026',
  '바르셀로나 5박 6일'
)
on conflict (id) do nothing;

insert into public.itineraries (trip_id, data, version)
values (
  '{TRIP_ID}',
  '{payload}'::jsonb,
  1
)
on conflict (trip_id) do update
set data = excluded.data,
    version = public.itineraries.version + 1,
    updated_at = now();
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(sql, encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
