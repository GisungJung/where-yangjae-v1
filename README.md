# 양재어디가 (where-yangjae)

양재역 주변 맛집 평가 사내 웹 서비스. Google Sheets로 굴리던 점심·회식 맛집 정보를 모바일에서 보기 좋게 옮기고, 누구나 닉네임으로 평가를 남길 수 있게 한다.

- **사용자**: 양재역 인근 근무 팀원 약 10~20명 (비공개)
- **데이터 규모**: 식당 약 80개 / 평점 약 200건
- **운영 비용**: 월 0원 (전부 무료 티어)

## 핵심 기능

- 카테고리·키워드·sheet_type(점심/저녁)·휴업포함 필터 + 정렬(평점/평가수/이름) — 10건 단위 무한 스크롤·"맨위로" 플로팅 버튼
- 식당 등록·수정 (카카오 장소 검색 연동) — 카드/상세에서 진입
- 닉네임 자유 입력·변경 익명 평가 (별점 0.5단위 + 한줄평 200자) — 1인 N평가 허용, 평균은 닉네임별 최신 1건만 반영, 분당 1·시간당 10 rate-limit
- 한줄평 사진 첨부 (최대 3장) — 클라이언트 1024px 리사이즈·JPEG 0.8 압축·300KB 가드, Supabase Storage `rating-photos` 버킷
- 룰렛 / "오늘 뭐먹지" 페이지 — 카테고리·sheet_type·휴업 토글로 랜덤 픽 (RPC `pick_random_restaurant`)
- 모바일 우선 반응형 UI + Pull-to-Refresh + 하단 탭 네비

## 기술 스택

- **프론트엔드**: Vite + React 19 + TypeScript + Tailwind 4, React Router, TanStack Query, Zustand
- **백엔드**: Supabase (PostgreSQL 15 / RLS / Storage 무료 티어)
- **지도**: Kakao Map JS SDK (식당 등록 시 장소 검색)
- **배포**: Vercel

## 개발

```bash
pnpm install
cp .env.example .env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_KAKAO_JS_KEY 채우기
pnpm dev               # http://localhost:5173
pnpm test              # vitest
pnpm lint
```

DB 변경은 `supabase/migrations/` 에 timestamped SQL로 산출. 원격 적용은 사용자가 수동 진행 (`supabase db push` 등).

자세한 기획은 [doc/plan/yangjai_plan.html](doc/plan/yangjai_plan.html) 참고.
