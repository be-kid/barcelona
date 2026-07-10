# apps/web — 커플 여행 플래너 (지도 | 일정 | 채팅)

## 로컬 실행 (키 없이)

```bash
cd apps/web
npm install
npm run dev
```

- 왼쪽: 일정 / 가운데: 지도 / 오른쪽: 채팅
- Supabase·OpenAI 키가 없으면 **목업 AI**로 동작
- 일정은 `public/itinerary.json` (레포 `data/itinerary.json` 복사본)

목업에서 시험해 볼 말:
- `점심 채워줘`
- `저녁 타파스`
- `해변 넣어줘`
- `몬주익`

## Supabase + OpenAI 연결

1. Supabase 프로젝트 생성 후 `supabase/migrations/001_init.sql` 적용  
2. Realtime에 `itineraries`, `messages` 추가  
3. `python3 scripts/generate_seed_sql.py` 후 seed SQL 실행 + 멤버 UUID 채우기  
4. `supabase secrets set OPENAI_API_KEY=...`  
5. `supabase functions deploy chat-ai`  
6. `apps/web/.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_TRIP_ID=11111111-1111-1111-1111-111111111111
VITE_USE_MOCK_AI=false
```

7. 매직 링크로 로그인(추후 UI) — 현재 Function은 JWT membership 검사

## 일정 JSON 갱신

```bash
cp ../../data/itinerary.json public/itinerary.json
```
