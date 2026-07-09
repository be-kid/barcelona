# 바르셀로나 여행 플래너 — 전체 구조 설계

## 한 줄 요약

**사람은 뼈대(숙소·날짜별 큰 일정)를 고정하고, OpenAI는 그 위에서 세부만 채우며, 웹은 일정 JSON을 지도+채팅으로 보여 준다.**

Cursor/이 채팅에서 초안을 짜도 되고, 웹 채팅으로 디테일을 이어가도 된다. 둘 다 같은 `itinerary` JSON을 진실의 원천(source of truth)으로 쓴다.

---

## 1. 목표 UX

```
┌─────────────────────────────┬──────────────────────────┐
│  지도 (날짜 레이어 / 핀)      │  채팅                      │
│  · Day 탭                   │  · "점심 근처 추천"         │
│  · 동선 폴리라인             │  · "Day3 해변으로"          │
│  · 숙소 고정 핀              │  · 변경 요약 + 적용 버튼    │
└─────────────────────────────┴──────────────────────────┘
```

- 왼쪽: 현재 일정 시각화 (AI 없음)
- 오른쪽: 대화로 세부 편집 (OpenAI)
- 채팅 결과가 JSON 패치로 반영되면 지도가 즉시 갱신

---

## 2. 데이터 모델: 잠금 vs 편집

일정을 두 층으로 나눈다.

| 층 | 내용 | 누가 정하나 | AI |
|----|------|-------------|-----|
| **locked** | 숙소, 여행 날짜, Day 테마/제목, 예약 확정 스팟(사그라다 10:00 등) | 사용자(또는 Cursor에서 사전 입력) | **기본적으로 수정 금지** |
| **draft** | 점심/카페/저녁, 사이 스팟, 팁, 선택 스팟, 동선 순서 미세조정 | 대화로 채움 | **여기만 수정** |

```json
{
  "meta": { "city": "Barcelona", "nights": 4, "days": 5 },
  "stay": {
    "name": "숙소명",
    "lat": 41.38,
    "lng": 2.18,
    "locked": true
  },
  "constraints": [
    "숙소는 변경하지 말 것",
    "Day2 사그라다 10:00 예약 유지",
    "하루 핵심 스팟 최대 5개"
  ],
  "days": [
    {
      "id": "day2",
      "title": "가우디 핵심",
      "theme": "사그라다 · 에이샴플레",
      "locked": true,
      "places": [
        {
          "id": "p_sagrada",
          "name": "사그라다 파밀리아",
          "lat": 41.4036,
          "lng": 2.1744,
          "time": "10:00",
          "locked": true,
          "source": "user_booking"
        },
        {
          "id": "p_lunch",
          "name": null,
          "slot": "lunch",
          "locked": false,
          "source": "ai_fill"
        }
      ]
    }
  ]
}
```

규칙:
- `locked: true` 필드는 모델이 바꾸려 해도 **서버에서 거부/무시**
- AI 응답은 전체 JSON 재생성보다 **JSON Patch / 부분 업데이트** 권장 (비용↓, 실수↓)

---

## 3. 시스템 구성

```
[Browser]
  MapView  ←── itinerary store (Zustand/그냥 React state)
  ChatPanel ──POST /api/chat──► [API Server]
                                   │
                                   ├─ system prompt + locked constraints
                                   ├─ current itinerary (compact)
                                   ├─ last N chat turns (짧게)
                                   └─ OpenAI (structured output)
                                          │
                                          ▼
                                   { reply, patch }
                                          │
                                   validate + apply patch
                                          │
                                          ▼
                                   updated itinerary → client → map redraw
```

### 구성 요소

| 부품 | 역할 | AI? |
|------|------|-----|
| 정적/SSR 웹 | 지도+채팅 UI | 없음 |
| `itinerary` store | 현재 일정 상태 | 없음 |
| Map (Maps JS / Mapbox) | 핀·루트 렌더 | 없음 |
| `/api/chat` | 프롬프트 조립, 호출, 검증 | OpenAI 호출 |
| OpenAI | 자연어 → 설명문 + 일정 패치 | 여기만 |
| (선택) Places/Geocoding | 새 스팟 좌표 보정 | API 별도 |

Cursor SDK는 **이 제품의 채팅 백엔드로 쓰지 않는다.**  
코딩/레포 수정용이고, 여행 채팅에는 OpenAI(또는 동급 채팅 API)가 맞다.

---

## 4. OpenAI의 정확한 역할

### 하는 일
1. **슬롯 채우기** — `lunch` / `cafe` / `dinner` / `between` 빈칸 제안
2. **부분 수정** — “Day3 오후만 해변으로” → 해당 day places만 패치
3. **제약 내 재배치** — 숙소·락된 예약 시간을 지키며 걷기 동선 정리
4. **짧은 설명** — 왜 그 스팟인지 1~2문장 (채팅용)
5. **질문** — 정보가 부족하면 좌표를 찍지 말고 되묻기 (예: 예산, 매운 음식)

### 하지 않는 일
- 숙소/항공/확정 예약 시간 변경 (락)
- 매 턴마다 4박5일 전체 재작성
- 웹 검색이 없으면 “실시간 영업시간/가격”을 단정하지 않음
- 지도 렌더링 (프론트 몫)

### 응답 포맷 (structured output)

```json
{
  "assistant_message": "Day3 오후에 바르셀로네타를 넣었어요. 벙커스는 일몰용으로 유지했습니다.",
  "patch": [
    {
      "op": "replace",
      "path": "/days/2/places",
      "value": [ /* 새 places 배열 */ ]
    }
  ],
  "needs_clarification": false
}
```

서버는 `patch` 적용 전:
1. locked 경로 변경 여부 검사
2. lat/lng 숫자·도시 범위 검사
3. day당 place 개수 상한 검사  
실패 시 사용자에게 “적용 불가” + 이유.

---

## 5. 비용이 싸게 나오는 설계

### 원칙
- **뼈대는 프롬프트에 한 번 넣고**, 매 턴은 **현재 itinerary 요약 + 최근 대화 몇 턴**만
- 모델은 **GPT-5.4-mini** 기본, 복잡한 재구성만 상위 모델
- 출력은 장문 에세이 금지, **짧은 reply + patch**
- 시스템 프롬프트는 **prompt caching** 대상(고정 문구)으로 두기

### 턴당 대략 토큰
| 항목 | 토큰 |
|------|------|
| system + 규칙 | ~800 (캐시 가능) |
| 현재 일정 compact | ~1,000–2,000 |
| 최근 대화 | ~500–1,500 |
| 출력(reply+patch) | ~400–1,200 |

→ mini 기준 **턴당 대개 $0.002–$0.02**  
→ 한 여행 20–40턴이면 **대략 $0.05–$0.50**

### 더 줄이는 팁
- Day 단위로만 컨텍스트 보내기 (“지금 편집 중: Day3”)
- “적용” 버튼을 두어, AI 제안을 바로 쓰지 않고 확인 후 패치
- 좌표는 AI가 대충 넣되, 가능하면 Geocoding으로 한 번 보정 (환각 좌표 방지)

---

## 6. 화면·상태 흐름

```
1. 앱 로드
   └─ locked 뼈대 JSON 로드 (숙소+Day 테마+확정 스팟)
   └─ 지도에 숙소+확정 핀 표시
   └─ 빈 슬롯은 지도에 회색/점선으로 "미정"

2. 사용자: "Day1 저녁은 보른에서 타파스"
   └─ /api/chat
   └─ AI: 보른 식당/존 제안 + day1 places 패치
   └─ UI: 채팅에 설명 + [적용] [다른 제안]
   └─ 적용 시 store 갱신 → 지도 핀 추가

3. 사용자: Day 탭 전환
   └─ 지도 레이어만 필터 (API 호출 없음)

4.보내기/저장
   └─ itinerary JSON export
   └─ (기존) CSV/KML/동선 링크 생성 가능
```

---

## 7. API 스케치

### `POST /api/chat`
```json
{
  "session_id": "…",
  "message": "Day3 오후를 해변 쪽으로",
  "itinerary": { /* 현재 전체 또는 compact */ },
  "focus_day": "day3"
}
```

### 응답
```json
{
  "assistant_message": "…",
  "proposed_itinerary": { /* 또는 patch */ },
  "diff_summary": ["Day3: 카사 비센스 제거", "바르셀로네타 추가"]
}
```

### `POST /api/itinerary/validate` (선택)
패치 적용 전 락/좌표/개수 검증만 수행.

---

## 8. 단계별 구현 로드맵

### Phase A — AI 없이 결과 뷰 (지금에 가까움)
- 왼쪽 지도 + 오른쪽 **일정 패널**(채팅 아님)
- Cursor/채팅에서 짠 JSON을 로드만
- **비용 0**, 바로 사용 가능

### Phase B — 채팅 편집 (OpenAI)
- 오른쪽을 ChatPanel로 교체
- `/api/chat` + structured patch
- locked 스키마 강제

### Phase C — 품질
- Geocoding, 영업시간 툴(선택), 세션 저장, 공유 링크
- Day focus로 토큰 절약

**추천:** 숙소·큰 일정이 이미 있으니 **A → B** 순.  
처음부터 B를 크게 만들 필요 없음.

---

## 9. 이 레포와의 연결

현재:
- `data/itinerary.json` — 숙소(locked) + Day 뼈대 + 스팟
- `site/` — **공유용** 지도+일정 페이지 (GitHub Pages)
- `scripts/sync_site.py` — 일정 → site/data + maps
- `docs/deploy.md` — 배포·공유 가성비 가이드

목표 확장:
```
site/                        # Phase A: 같이 보기 (지금)
api/chat                     # Phase B: OpenAI 세부 편집 (나중)
```

같이 **보기만** 하면 Pages URL이면 충분.  
같이 **실시간으로 고치려면** 나중에 DB가 필요하고, 호스팅 자체는 여전히 무료 티어로 가능.

---

## 10. 결정 정리

| 질문 | 답 |
|------|----|
| 웹에 AI 필수? | 결과만 띄우면 **아니오**. 웹에서 대화 편집하면 **예(OpenAI)** |
| Cursor 연동? | 제품 채팅용 아님. 일정 초안/코드 작업용 |
| AI 역할? | **락된 뼈대 위의 세부 편집기** |
| 비용? | mini + 패치 방식이면 여행 1건 **대개 수백 원 이하** |
| 지도? | itinerary JSON 구독만; AI와 분리 |
