#!/usr/bin/env python3
"""Sync itinerary into site/ for static hosting (GitHub Pages)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "itinerary.json"
SITE = ROOT / "site"
MAPS = ROOT / "maps"
WEB_PUBLIC = ROOT / "apps" / "web" / "public"


def maps_place_url(place: dict) -> str:
    from urllib.parse import quote

    name = place.get("name_en") or place.get("name") or "Barcelona"
    return f"https://www.google.com/maps/search/?api=1&query={quote(f'{name} Barcelona')}"


def maps_dir_api_url(places: list[dict], travelmode: str = "walking") -> str:
    from urllib.parse import urlencode

    route = [
        p
        for p in places
        if not p.get("exclude_from_route")
        and p.get("lat") is not None
        and p.get("lng") is not None
    ]
    if len(route) < 2:
        return maps_place_url(route[0]) if route else "https://www.google.com/maps"
    origin = f"{route[0]['lat']},{route[0]['lng']}"
    destination = f"{route[-1]['lat']},{route[-1]['lng']}"
    waypoints = "|".join(f"{p['lat']},{p['lng']}" for p in route[1:-1])
    params = {
        "api": "1",
        "origin": origin,
        "destination": destination,
        "travelmode": travelmode,
    }
    if waypoints:
        params["waypoints"] = waypoints
    return "https://www.google.com/maps/dir/?" + urlencode(params)


def enrich(data: dict) -> dict:
    days = []
    for day in data["days_plan"]:
        places = [{**p, "google_maps": maps_place_url(p)} for p in day["places"]]
        days.append(
            {
                **day,
                "places": places,
                "google_maps_directions": maps_dir_api_url(
                    places, day.get("travelmode", "walking")
                ),
            }
        )
    out = {**data, "days_plan": days}
    if data.get("stay"):
        stay = dict(data["stay"])
        stay["google_maps"] = maps_place_url(stay)
        out["stay"] = stay
    return out


def main() -> None:
    # Prefer generate_maps for CSV/KML side effects
    gen = ROOT / "scripts" / "generate_maps.py"
    if gen.exists():
        import runpy

        runpy.run_path(str(gen), run_name="__main__")

    raw = json.loads(DATA.read_text(encoding="utf-8"))
    enriched = enrich(raw)

    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "itinerary.json").write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Also keep enriched at repo data/ for local tools
    (ROOT / "data" / "itinerary.enriched.json").write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if WEB_PUBLIC.exists():
        (WEB_PUBLIC / "itinerary.json").write_text(
            json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    if MAPS.exists():
        dest = SITE / "maps"
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(MAPS, dest)

    print(f"Synced → {SITE}/ + {WEB_PUBLIC}/itinerary.json")


if __name__ == "__main__":
    main()
