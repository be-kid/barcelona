# 바르셀로나 여행 맵 플래너

실제 일정은 `data/itinerary.json`에 두고, **앱 개발**은 `apps/web`에서 진행합니다.

## 앱 개발 (지금)

```bash
cd apps/web
npm install
npm run dev
```

레이아웃: **일정 | 지도 | 채팅**  
키 없으면 목업 AI로 UI·동선부터 개발 가능. 자세한 내용: [`apps/web/README.md`](apps/web/README.md)

## Supabase

- 설계: [`docs/supabase-design.md`](docs/supabase-design.md)
- 마이그레이션: `supabase/migrations/001_init.sql`
- Edge Function: `supabase/functions/chat-ai/`

## 정적 공유 페이지 (AI 없음)

```bash
python3 scripts/sync_site.py
python3 -m http.server 8080 --directory site
```

GitHub Pages: [`docs/deploy.md`](docs/deploy.md)

## 일정 수정 → 맵/사이트 동기화

```bash
python3 scripts/sync_site.py
cp data/itinerary.json apps/web/public/itinerary.json
```
