# Supabase 설계 — 둘이서 AI와 대화하는 여행 플래너

## 한 줄

**프론트(지도+채팅) + Supabase(DB·Realtime·Edge Function) + OpenAI.**  
VPS 없이, 커플이 같은 trip 링크에서 AI와 말하고 일정이 서로 동기화된다.

---

## 1. 왜 Supabase인가

| 필요 | Supabase |
|------|----------|
| OpenAI 키 숨기기 | **Edge Functions** |
| 일정·채팅 저장 | **Postgres** |
| 상대 화면에 바로 반영 | **Realtime** |
| 둘만 접근 | **Auth + RLS** (또는 비밀 링크 토큰) |

호스팅은 정적 사이트(Vercel/Cloudflare/Pages)면 충분. “서버” 역할은 Edge Function이 한다.

---

## 2. 전체 구조

```
┌──────────────┐     ┌──────────────┐
│  나 (브라우저) │     │ 여친 (브라우저) │
│ 지도 | 채팅   │     │ 지도 | 채팅    │
└──────┬───────┘     └──────┬───────┘
       │  supabase-js        │
       └──────────┬──────────┘
                  ▼
         ┌─────────────────┐
         │    Supabase     │
         │  Auth / RLS     │
         │  trips          │◄── Realtime (둘 다 subscribe)
         │  itinerary      │
         │  messages       │
         │  Edge: chat-ai  │──► OpenAI API
         └─────────────────┘
```

### 요청 흐름 (채팅 1턴)

1. 사용자가 메시지 입력  
2. 클라이언트가 `messages`에 user row insert (또는 Function에만 전달)  
3. `chat-ai` Edge Function 호출  
4. Function이 `itinerary` + `constraints` + 최근 메시지 로드  
5. OpenAI structured output → `assistant_message` + `patch`  
6. Function이 locked 검증 후 `itinerary.data` 업데이트, assistant message 저장  
7. Realtime으로 양쪽 UI의 지도·채팅 갱신  

---

## 3. 데이터 모델 (Postgres)

### 3.1 `trips` — 여행 방

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `slug` | text unique | 공유 URL용 (`barcelona-2026`) |
| `title` | text | |
| `invite_code` | text unique | 짧은 초대 코드 (선택) |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

### 3.2 `trip_members` — 참가자 (나·여친)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `trip_id` | uuid FK | |
| `user_id` | uuid FK | |
| `role` | text | `owner` \| `member` |
| `display_name` | text | |

PK: `(trip_id, user_id)`

### 3.3 `itineraries` — 일정 (진실의 원천)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `trip_id` | uuid PK/FK | trip당 1행 |
| `data` | jsonb | 전체 일정 (stay, days_plan, locked…) |
| `version` | int | 낙관적 동시성 |
| `updated_at` | timestamptz | |
| `updated_by` | uuid | |

`data` 형태는 기존 `docs/itinerary.schema.json` / `data/itinerary.json`과 동일하게 유지.

### 3.4 `messages` — 채팅

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `trip_id` | uuid FK | |
| `role` | text | `user` \| `assistant` \| `system` |
| `user_id` | uuid null | assistant면 null |
| `content` | text | 화면에 보이는 말 |
| `focus_day` | text null | `day3` 등 |
| `patch` | jsonb null | assistant가 제안/적용한 패치 |
| `diff_summary` | jsonb null | `["Day3: …"]` |
| `created_at` | timestamptz | |

### 3.5 (선택) `ai_runs` — 비용·디버그

| 컬럼 | 타입 |
|------|------|
| `id`, `trip_id`, `model`, `input_tokens`, `output_tokens`, `created_at` | |

---

## 4. SQL 스케치

```sql
-- trips
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  invite_code text unique default encode(gen_random_bytes(6), 'hex'),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.trip_members (
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner', 'member')) not null default 'member',
  display_name text,
  primary key (trip_id, user_id)
);

create table public.itineraries (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  role text check (role in ('user', 'assistant', 'system')) not null,
  user_id uuid references auth.users(id),
  content text not null,
  focus_day text,
  patch jsonb,
  diff_summary jsonb,
  created_at timestamptz default now()
);

create index messages_trip_created on public.messages (trip_id, created_at);
```

Realtime: `itineraries`, `messages`를 publication에 추가.

```sql
alter publication supabase_realtime add table public.itineraries;
alter publication supabase_realtime add table public.messages;
```

---

## 5. 권한 (RLS) — 두 가지 모드

### 모드 A — 로그인 (추천, 안전)

- 매직 링크 / Google 로그인  
- `trip_members`에 있는 사용자만 해당 trip의 itinerary·messages 읽기/쓰기  
- Edge Function은 **service role**로 OpenAI 호출 후 DB 기록, 호출 전 membership 검증

```sql
-- 예시: 멤버만 itinerary 읽기
create policy "members read itinerary"
  on public.itineraries for select
  using (
    exists (
      select 1 from public.trip_members m
      where m.trip_id = itineraries.trip_id
        and m.user_id = auth.uid()
    )
  );
```

### 모드 B — 비밀 링크만 (로그인 최소)

- URL: `/t/{slug}?code={invite_code}`  
- Edge Function이 code 검증 후 세션/JWT 발급, 또는 code를 헤더로 매번 검증  
- 구현은 단순하지만 링크 유출 시 노출 → 커플용 단기 프로젝트면 실용적

**초기 구현 추천:** 모드 A (매직 링크 2명만 초대).

---

## 6. Edge Function: `chat-ai`

### 입력
```json
{
  "trip_id": "…",
  "message": "Day3 오후에 해변 넣어줘",
  "focus_day": "day3"
}
```

### 처리
1. JWT로 `auth.uid()` 확인 → `trip_members` 검사  
2. `itineraries.data` 로드  
3. 최근 메시지 N개 (예: 12) 로드 — **전체 히스토리 X** (비용)  
4. system prompt: locked 규칙 + constraints + (focus_day면 해당 day만 강조)  
5. OpenAI (`gpt-5.4-mini` 기본) structured output  
6. patch 적용 시뮬레이션 → locked 경로 변경 시 거부  
7. 트랜잭션: `messages` user+assistant insert, `itineraries` update (`version` +1)  
8. 응답: `{ assistant_message, itinerary, diff_summary }`

### 시크릿
- `OPENAI_API_KEY` — Supabase secrets  
- 절대 프론트에 넣지 않음  

### 의사코드
```ts
// supabase/functions/chat-ai/index.ts
const { trip_id, message, focus_day } = await req.json()
const user = await getUser(req)
assertMember(trip_id, user.id)

const itinerary = await db.from('itineraries').select('data, version').eq('trip_id', trip_id).single()
const recent = await db.from('messages').select('*').eq('trip_id', trip_id).order('created_at', { ascending: false }).limit(12)

const ai = await openai.chat.completions.parse({ /* system + itinerary compact + recent + message */ })
const { assistant_message, patch, diff_summary, needs_clarification } = ai

if (!needs_clarification) {
  const next = applyPatch(itinerary.data, patch)
  assertNoLockedMutation(itinerary.data, next)
  await db.from('itineraries').update({ data: next, version: itinerary.version + 1, updated_by: user.id })
}
await db.from('messages').insert([
  { trip_id, role: 'user', user_id: user.id, content: message, focus_day },
  { trip_id, role: 'assistant', content: assistant_message, patch, diff_summary, focus_day },
])
return { assistant_message, itinerary: next, diff_summary }
```

---

## 7. 프론트 연동

기존 `site/`를 확장하는 방향:

| 영역 | 동작 |
|------|------|
| 로드 | `itineraries` select by trip slug → 지도 렌더 |
| Realtime | `itineraries` UPDATE / `messages` INSERT subscribe |
| 채팅 전송 | `functions.invoke('chat-ai', { body })` |
| Day 탭 | 로컬 state만 (API 없음) |
| 적용 UX | AI가 바로 반영 or `[적용]` 버튼 — **바로 반영**이 Realtime과 잘 맞음. 되돌리기는 version/스냅샷으로 나중에 |

공유 URL 예:
```
https://your-app.vercel.app/t/barcelona-2026
```

---

## 8. OpenAI 역할 (이 구조 안에서의 위치)

변하지 않음 — **locked 뼈대 위의 세부 편집기**.

- 입력: 현재 `itineraries.data` + 짧은 대화  
- 출력: 채팅 문장 + JSON patch  
- 금지: 숙소·locked 스팟·Day 테마 무단 변경 (Function에서 재검증)

비용: mini + Day focus면 여행 준비 기간 전체도 보통 **수천 원 이하**.

---

## 9. 동시 편집 충돌

둘이 거의 동시에 보내면:

1. **낙관적 lock:** `version` 불일치 시 재시도 (Function이 최신 다시 읽고 재적용)  
2. 메시지 순서는 DB `created_at`  
3. UX: “상대가 방금 Day2를 수정했어요” 토스트 (Realtime)

커플 2명이라 충돌은 드묾. CRDT까지는 불필요.

---

## 10. 비용 감 (커플 1여행)

| 항목 | 예상 |
|------|------|
| Supabase Free | DB·Realtime·Edge 호출 여유 |
| 프론트 호스팅 | Vercel/Pages 무료 |
| OpenAI | 대화량에 따라 **대개 $0.5–$5** (준비 기간 전체) |

유료 전환 트리거: 트래픽이 커질 때. 둘만 쓰면 Free로 충분한 경우가 많음.

---

## 11. 구현 로드맵

### Phase 0 — 지금 (완료에 가까움)
- 정적 `site/` + 로컬/Pages 일정 보기  

### Phase 1 — Supabase 뼈대
- 프로젝트 생성, 위 테이블 + RLS  
- `data/itinerary.json`을 `itineraries.data`로 시드  
- 로그인 2명 + trip 멤버 초대  
- 읽기 전용으로 웹이 DB 일정 표시 + Realtime  

### Phase 2 — AI 채팅
- `chat-ai` Function + OpenAI secret  
- 채팅 UI, patch 적용, 지도 동기화  

### Phase 3 — 다듬기
- focus_day로 토큰 절약  
- 메시지별 diff 하이라이트  
- My Maps/CSV export는 기존 스크립트 유지  

**추천 순서:** Phase 1 → 2. AI보다 먼저 “같은 DB 일정 + Realtime”이 되면 같이 보는 경험이 완성되고, 그다음 대화만 붙이면 된다.

---

## 12. 레포에 둘 폴더 (예정)

```
supabase/
  migrations/001_init.sql
  functions/chat-ai/index.ts
  seed/itinerary.json          # data/itinerary.json 복사
docs/supabase-design.md        # 이 문서
site/                          # 이후 supabase-js 연동
```

---

## 13. 결정 정리

| 질문 | 답 |
|------|----|
| Supabase로 가능? | **가능** — Edge Function이 서버 역할 |
| VPS 필요? | **아니오** |
| 여친도 AI 대화? | 같은 trip 멤버면 Function 호출 가능 |
| 일정이 서로 보임? | `itineraries` Realtime |
| API 키 노출? | Edge Function secrets만 |
| 기존 JSON? | `itineraries.data`에 그대로 시드 |

다음 구현 스텝이 필요하면 Phase 1용 `migrations/001_init.sql` + seed부터 이 레포에 추가하면 된다.
