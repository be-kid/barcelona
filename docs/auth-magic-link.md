# 매직 링크 로그인 설정

커플 2명만 들어오게: **Supabase Auth 매직 링크** + **trip_members** + **초대 코드**.

## 1. Supabase Dashboard

### Authentication → Providers
- **Email** 켜기
- **Confirm email** — 개발 중에는 끄면 편함 (링크만으로 바로 입장)
- **Magic Link** 사용 (기본 OTP)

### Authentication → URL Configuration
| 항목 | 값 |
|------|-----|
| Site URL | `http://localhost:5173` (배포 후 프로덕션 URL) |
| Redirect URLs | `http://localhost:5173/**`, `https://your-app.vercel.app/**` |

## 2. DB

```bash
# SQL Editor에서 순서대로
supabase/migrations/001_init.sql
supabase/migrations/002_join_invite.sql
python3 scripts/generate_seed_sql.py
# supabase/seed/002_itinerary_data.sql + trips/members 시드
```

`trips.invite_code` — 여친에게 공유할 코드 (Dashboard에서 확인 가능)

## 3. 앱 `.env.local`

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_TRIP_ID=11111111-1111-1111-1111-111111111111
VITE_USE_MOCK_AI=false
```

## 4. 사용자 흐름

1. **나**: 이메일 → 메일 링크 클릭 → 초대 코드 입력 (또는 SQL로 owner 미리 등록)
2. **여친**: 같은 URL → 이메일 → 링크 → **같은 초대 코드** 입력
3. 둘 다 `trip_members`에 있으면 일정·채팅·AI 사용

## 5. Owner를 SQL로 미리 넣기 (선택)

매직 링크로 한 번 로그인한 뒤 Supabase → Authentication → Users 에서 UUID 복사:

```sql
insert into public.trip_members (trip_id, user_id, role, display_name)
values (
  '11111111-1111-1111-1111-111111111111',
  'YOUR-USER-UUID',
  'owner',
  'Lee'
);
```

이렇게 하면 초대 코드 화면 없이 바로 앱 진입.

## 비용

매직 링크 / Auth MAU — **커플 2명이면 무료 티어 안** (별도 링크당 과금 없음).
