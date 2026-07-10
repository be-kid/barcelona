# apps/web — 커플 여행 플래너 (지도 | 일정 | 채팅)

## 로컬 실행 (키 없이)

```bash
cd apps/web
npm install
npm run dev
```

- Supabase env가 **없으면** 로그인 없이 **목업 AI**로 동작
- 일정: `public/itinerary.json`

## Supabase + 매직 링크

1. Supabase 프로젝트 + 마이그레이션 (`001`, `002`)  
2. `.env.local` 설정 (아래)  
3. Dashboard에서 Email Auth·Redirect URL 설정 — 자세히: [`docs/auth-magic-link.md`](../../docs/auth-magic-link.md)

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_TRIP_ID=11111111-1111-1111-1111-111111111111
VITE_USE_MOCK_AI=false
```

### 로그인 흐름
1. 이메일 입력 → 메일 링크 클릭  
2. 초대 코드 입력 (`trips.invite_code`) — 둘 다 같은 코드  
3. 멤버면 지도·채팅·AI 사용  

Owner를 SQL로 미리 넣으면 초대 코드 단계 생략 가능.

## OpenAI

```bash
supabase secrets set OPENAI_API_KEY=...
supabase functions deploy chat-ai
```

## 일정 JSON 갱신

```bash
cp ../../data/itinerary.json public/itinerary.json
```
