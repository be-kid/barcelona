# 바르셀로나 4박 5일 맵 플래너

대화로 짠 여행 일정을 **날짜별로 나눠** 구글맵에 바로 찍을 수 있게 만든 저장소입니다.  
여자친구와 **같은 링크**로 보려면 `site/`를 **GitHub Pages(무료)** 로 배포하면 됩니다.

## 같이 보기 (가성비 1순위)

| 방법 | 비용 | 설명 |
|------|------|------|
| **GitHub Pages** | **무료** | `site/` 배포 → URL 공유. [설정 방법](docs/deploy.md) |
| My Maps CSV/KML | 무료 | 구글 계정에 핀 저장 |
| 실시간 공동 편집 | 추후 | Firebase 등 필요할 때만 |

로컬에서 공유 페이지 미리보기:

```bash
python3 scripts/sync_site.py
python3 -m http.server 8080 --directory site
# http://localhost:8080
```

## 바로 쓰기

| 방법 | 설명 |
|------|------|
| **공유 페이지** | `site/` — 왼쪽 일정 · 오른쪽(데스크톱) 지도 |
| **동선 링크** | `itinerary/README.md`에서 Day별 「동선 열기」 |
| **My Maps 핀** | [mymaps.google.com](https://www.google.com/mymaps) → 가져오기 → `maps/dayN.csv` |

## 일정 수정 후 맵·사이트 갱신

1. `data/itinerary.json`에서 숙소·스팟 수정  
2. 실행:

```bash
python3 scripts/sync_site.py
```

3. `site/`, `maps/`, `itinerary/`가 갱신됩니다. `main`에 푸시하면 Pages가 자동 배포됩니다.

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
