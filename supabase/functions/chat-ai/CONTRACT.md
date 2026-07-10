# chat-ai Edge Function — 계약

## Endpoint
`POST /functions/v1/chat-ai`

## Headers
- `Authorization: Bearer <user JWT>`
- `Content-Type: application/json`

## Body
```json
{
  "trip_id": "uuid",
  "message": "Day3 오후에 해변 넣어줘",
  "focus_day": "day3"
}
```

## Success 200
```json
{
  "assistant_message": "…",
  "itinerary": { },
  "diff_summary": ["…"],
  "needs_clarification": false,
  "version": 4
}
```

## Secrets
- `OPENAI_API_KEY`
- (자동) `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## 구현
`supabase/functions/chat-ai/index.ts`

## Safety
1. membership check  
2. locked stay/day/place 서버 재검증  
3. version optimistic lock  
4. focus_day compact context  
