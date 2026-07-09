# 바르셀로나 4박 5일 맵 플래너

대화로 짠 여행 일정을 **날짜별로 나눠** 구글맵에 바로 찍을 수 있게 만든 저장소입니다.

구글 계정으로 지도를 “대신 저장”하진 못하지만, 아래처럼 **동선 링크**와 **My Maps 가져오기 파일**을 자동 생성합니다.

## 바로 쓰기

| 방법 | 설명 |
|------|------|
| **동선 링크** | `itinerary/README.md` 또는 `public/index.html`에서 Day별 「동선 열기」 |
| **My Maps 핀** | [mymaps.google.com](https://www.google.com/mymaps) → 새 지도 → 가져오기 → `maps/dayN.csv` 또는 `.kml` |
| **전체 한 파일** | `maps/barcelona-all-days.kml` / `.csv` |

로컬에서 플래너 UI:

```bash
python3 -m http.server 8080 --directory .
# http://localhost:8080/public/
```

## 일정 수정 후 맵 다시 찍기

1. `data/itinerary.json`에서 스팟·순서·메모 수정  
2. 생성 스크립트 실행:

```bash
python3 scripts/generate_maps.py
```

3. `maps/`, `itinerary/`, `data/itinerary.enriched.json`이 갱신됩니다.

## 폴더 구조

```
data/itinerary.json          # 원본 일정 (여기만 편집)
scripts/generate_maps.py     # 구글맵 URL + CSV/KML 생성
maps/day1.csv … day5.kml     # My Maps 가져오기용
itinerary/day1.md …          # 날짜별 요약 + 링크
public/index.html            # 클릭해서 쓰는 플래너
```

## 기본 4박 5일 테마

1. 도착 · 구시가지 (고딕 / 람블라스 / 보른)  
2. 가우디 핵심 (사그라다 · 산트파우 · 카사 바트요/밀라)  
3. 파크 구엘 · 그라시아 · 벙커스  
4. 몬주익 · 매직 분수 · 항구  
5. 여유 · 쇼핑 · 출국  

대화로 일정을 바꾸면 같은 방식으로 맵 파일을 다시 뽑아 드리면 됩니다.

## 다음 단계: 웹(지도+채팅) 구조

숙소·큰 일정은 고정하고, 웹에서는 세부만 대화로 채우는 설계는 아래에 정리해 두었습니다.

- [`docs/architecture.md`](docs/architecture.md) — 전체 구조 (지도 | 채팅, locked vs draft)
- [`docs/ai-role.md`](docs/ai-role.md) — OpenAI 역할·비용
- [`docs/itinerary.schema.json`](docs/itinerary.schema.json) — 일정 스키마

**결과만 띄우기**면 AI 연동 불필요. **웹에서 대화 편집**할 때만 OpenAI(채팅 API)를 붙이면 됩니다. Cursor SDK는 이 제품 채팅용으로 쓰지 않습니다.
