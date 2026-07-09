#!/usr/bin/env python3
"""Generate Google Maps day links + My Maps import files from itinerary.json."""

from __future__ import annotations

import csv
import json
import urllib.parse
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "itinerary.json"
MAPS = ROOT / "maps"
ITINERARY = ROOT / "itinerary"


def maps_search_url(place: dict) -> str:
    q = f"{place['lat']},{place['lng']}"
    name = urllib.parse.quote(place["name_en"])
    return f"https://www.google.com/maps/search/?api=1&query={q}&query_place_id=&q={name}"


def maps_place_url(place: dict) -> str:
    # Reliable pin: search by coordinates + name
    name = place.get("name_en") or place.get("name") or "Barcelona"
    if place.get("lat") is not None and place.get("lng") is not None:
        return (
            "https://www.google.com/maps/search/?api=1&query="
            + urllib.parse.quote(f"{place['lat']},{place['lng']}")
        )
    if not name or name == "Barcelona":
        return "https://www.google.com/maps/search/?api=1&query=Barcelona"
    query = urllib.parse.quote(f"{name} Barcelona")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def _mappable(places: list[dict]) -> list[dict]:
    return [
        p
        for p in places
        if p.get("lat") is not None
        and p.get("lng") is not None
        and not p.get("exclude_from_route")
    ]


def maps_dir_url(places: list[dict], travelmode: str = "walking") -> str:
    """Build a Google Maps directions URL with ordered stops (max ~10)."""
    route = _mappable(places)
    if not route:
        return "https://www.google.com/maps"
    if len(route) == 1:
        return maps_place_url(route[0])

    # /dir/A/B/C/... works well and shows the route with pins
    parts = []
    for p in route:
        parts.append(urllib.parse.quote(f"{p['lat']},{p['lng']}"))
    path = "/".join(parts)
    return f"https://www.google.com/maps/dir/{path}/data=!4m2!4m1!3e2"  # 3e2 = walking


def maps_dir_api_url(places: list[dict], travelmode: str = "walking") -> str:
    route = _mappable(places)
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
    return "https://www.google.com/maps/dir/?" + urllib.parse.urlencode(params)


def write_csv(day: dict, path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "description", "latitude", "longitude", "order", "time"])
        for p in day["places"]:
            if p.get("lat") is None or p.get("lng") is None:
                continue
            en = p.get("name_en") or ""
            label = f"{p['order']}. {p['name']}" + (f" ({en})" if en else "")
            desc = f"{day['label']} · {p.get('time', '')} · {p.get('note', '')}"
            w.writerow(
                [
                    label,
                    desc,
                    p["lat"],
                    p["lng"],
                    p["order"],
                    p.get("time", ""),
                ]
            )


def write_kml(day: dict, path: Path) -> None:
    placemarks = []
    coords_line = []
    for p in day["places"]:
        if p.get("lat") is None or p.get("lng") is None:
            continue
        coords_line.append(f"{p['lng']},{p['lat']},0")
        desc = escape(
            f"{p.get('time', '')} · {p.get('duration', '')}\n{p.get('note', '')}"
        )
        placemarks.append(
            f"""    <Placemark>
      <name>{escape(str(p['order']) + '. ' + p['name'])}</name>
      <description>{desc}</description>
      <Point><coordinates>{p['lng']},{p['lat']},0</coordinates></Point>
    </Placemark>"""
        )

    line = ""
    if len(coords_line) >= 2:
        line = f"""    <Placemark>
      <name>{escape(day['label'] + ' route')}</name>
      <Style>
        <LineStyle><color>ff2a6fdb</color><width>4</width></LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>{' '.join(coords_line)}</coordinates>
      </LineString>
    </Placemark>"""

    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{escape(day['label'] + ' · ' + day['title'])}</name>
    <description>{escape(day.get('summary', ''))}</description>
{chr(10).join(placemarks)}
{line}
  </Document>
</kml>
"""
    path.write_text(kml, encoding="utf-8")


def write_all_kml(days: list[dict], path: Path) -> None:
    folders = []
    for day in days:
        marks = []
        for p in day["places"]:
            if p.get("lat") is None or p.get("lng") is None:
                continue
            desc = escape(
                f"{p.get('time', '')} · {p.get('duration', '')}\n{p.get('note', '')}"
            )
            marks.append(
                f"""      <Placemark>
        <name>{escape(str(p['order']) + '. ' + p['name'])}</name>
        <description>{desc}</description>
        <Point><coordinates>{p['lng']},{p['lat']},0</coordinates></Point>
      </Placemark>"""
            )
        folders.append(
            f"""    <Folder>
      <name>{escape(day['label'] + ' · ' + day['title'])}</name>
{chr(10).join(marks)}
    </Folder>"""
        )
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Barcelona trip</name>
{chr(10).join(folders)}
  </Document>
</kml>
"""
    path.write_text(kml, encoding="utf-8")


def write_day_markdown(day: dict, dir_url: str, path: Path) -> None:
    lines = [
        f"# {day['label']} — {day['title']}",
        "",
        f"**날짜:** {day.get('date', '')}",
        "",
        f"**테마:** {day['theme']}",
        "",
        day["summary"],
        "",
        f"## 📍 오늘 동선 (구글맵에서 한 번에 열기)",
        "",
        f"[Google Maps 동선 열기]({dir_url})",
        "",
        "## 스팟 목록",
        "",
    ]
    if not day["places"]:
        lines.append("_아직 스팟이 없습니다. 같이 채워 가요._")
        lines.append("")
    for p in day["places"]:
        pin = maps_place_url(p) if p.get("lat") is not None else None
        opt = " *(선택)*" if p.get("optional") else ""
        lock = " *(고정)*" if p.get("locked") else ""
        tbd = " *(미정)*" if p.get("lat") is None else ""
        lines.append(
            f"{p['order']}. **{p['name']}**{lock}{opt}{tbd} — {p.get('time', '')} · {p.get('duration', '')}  "
        )
        lines.append(f"   {p.get('note', '')}  ")
        if pin:
            lines.append(f"   [지도에서 보기]({pin})")
        lines.append("")
    if day.get("tips"):
        lines.append("## 팁")
        lines.append("")
        for t in day["tips"]:
            lines.append(f"- {t}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    MAPS.mkdir(parents=True, exist_ok=True)
    ITINERARY.mkdir(parents=True, exist_ok=True)

    data = json.loads(DATA.read_text(encoding="utf-8"))
    enriched_days = []
    index_lines = [
        f"# {data['title']}",
        "",
        data["assumptions"]["base"],
        "",
        "## 날짜별 구글맵 동선",
        "",
    ]

    for day in data["days_plan"]:
        places = day["places"]
        dir_url = maps_dir_api_url(places, day.get("travelmode", "walking"))
        day_out = {
            **day,
            "google_maps_directions": dir_url,
            "places": [
                {**p, "google_maps": maps_place_url(p)} for p in places
            ],
        }
        enriched_days.append(day_out)

        write_csv(day, MAPS / f"{day['id']}.csv")
        write_kml(day, MAPS / f"{day['id']}.kml")
        write_day_markdown(day, dir_url, ITINERARY / f"{day['id']}.md")

        index_lines.append(
            f"- **{day['label']} {day['title']}** — [동선 열기]({dir_url})"
        )

    write_all_kml(data["days_plan"], MAPS / "barcelona-all-days.kml")

    # Combined CSV for My Maps (all days, with day column)
    with (MAPS / "barcelona-all-days.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "description", "latitude", "longitude", "day", "order"])
        for day in data["days_plan"]:
            for p in day["places"]:
                if p.get("lat") is None or p.get("lng") is None:
                    continue
                w.writerow(
                    [
                        f"{day['label']} {p['order']}. {p['name']}",
                        f"{p.get('time', '')} · {p.get('note', '')}",
                        p["lat"],
                        p["lng"],
                        day["label"],
                        p["order"],
                    ]
                )

    enriched = {
        **data,
        "days_plan": enriched_days,
        "how_to_import_my_maps": [
            "https://www.google.com/mymaps 접속 (구글 계정 필요)",
            "새 지도 만들기 → 레이어 추가 → 가져오기",
            "maps/dayN.csv 또는 maps/dayN.kml 업로드",
            "날짜마다 레이어를 나누면 켜고 끄기 쉬움",
        ],
    }
    (ROOT / "data" / "itinerary.enriched.json").write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    index_lines.extend(
        [
            "",
            "## My Maps에 핀 한꺼번에 찍기",
            "",
            "1. [Google My Maps](https://www.google.com/mymaps) 열기",
            "2. **새 지도 만들기** → 레이어에서 **가져오기**",
            "3. `maps/day1.csv` ~ `day5.csv` (또는 `barcelona-all-days.kml`) 업로드",
            "4. 날짜별 레이어를 켜고 끄며 사용",
            "",
            "파일 위치: `maps/`",
            "",
        ]
    )
    (ITINERARY / "README.md").write_text("\n".join(index_lines), encoding="utf-8")
    print(f"Generated {len(enriched_days)} days → maps/ + itinerary/")


if __name__ == "__main__":
    main()
