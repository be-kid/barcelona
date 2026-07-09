# 배포 · 공유 (가성비)

여자친구와 **같은 페이지 링크**로 일정을 보려면 배포가 필요합니다.  
지금 단계(일정 보기 + 지도)는 **정적 사이트**라서 제일 싼 방법은 아래입니다.

## 추천: GitHub Pages — **무료**

| 항목 | 내용 |
|------|------|
| 비용 | **0원** (공개 레포 기준) |
| 적합한 용도 | 링크 공유해서 **같이 보기** |
| 주소 예 | `https://be-kid.github.io/barcelona/` |
| 한계 | 둘이 **동시에 편집·실시간 반영**은 안 됨 (배포된 스냅샷을 같이 봄) |

이 레포는 `site/` 폴더를 Pages로내도록 워크플로를 넣어 두었습니다.

### 켜는 방법 (한 번만)
1. GitHub 레포 → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. `main`(또는 이 PR 머지 후)에 푸시되면 Actions가 `site/`를 배포
4. 나온 URL을 공유

로컬 미리보기:
```bash
python3 -m http.server 8080 --directory site
# http://localhost:8080
```

## 다른 옵션 비교

| 방법 | 비용 | 언제 |
|------|------|------|
| **GitHub Pages** | 무료 | 지금처럼 공유해서 보기 ✅ |
| Cloudflare Pages / Netlify / Vercel | 무료 티어 | 커스텀 도메인·프리뷰 원할 때 |
| Firebase/Supabase + 호스팅 | 무료 티어 | **둘이 같이 고치고 바로 반영**할 때 |
| 유료 VPS | 월 과금 | 불필요 |

## “같이 본다” vs “같이 고친다”

- **같이 본다** → Pages URL 공유면 충분 (지금)
- **같이 고친다(실시간)** → 나중에 DB(예: Firebase 무료) 필요. 배포 자체는 여전히 Pages/Netlify로 가능

일정·숙소는 `data/itinerary.json` → `python3 scripts/sync_site.py` → `site/` 반영 후 푸시하면 공유 페이지가 갱신됩니다.
