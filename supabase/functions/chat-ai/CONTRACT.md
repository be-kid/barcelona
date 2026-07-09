# chat-ai Edge Function — 계약 (구현 전 스펙)

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
  "assistant_message": "Day3 오후에 바르셀로네타를 넣었어요.",
  "itinerary": { },
  "diff_summary": ["Day3: 카사 비센스 제거", "바르셀로네타 추가"],
  "needs_clarification": false,
  "version": 4
}
```

## Errors
| code | when |
|------|------|
| 401 | 비로그인 |
| 403 | trip 멤버 아님 |
| 409 | version conflict (재시도) |
| 422 | locked 필드 변경 시도 / 잘못된 patch |
| 429 | rate limit |
| 500 | OpenAI/서버 오류 |

## Secrets
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Function 런타임 기본 제공되는 경우 제외하고 문서화)

## Model default
`gpt-5.4-mini` — 여행 슬롯 채우기용. 실패/복잡 재구성만 상위 모델.

## Safety
1. membership check before any OpenAI call  
2. never return API key  
3. re-validate locked paths server-side after model output  
4. cap recent messages (e.g. 12) and prefer `focus_day` compact itinerary  
