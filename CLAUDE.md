# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**비즈밥** (구 '양재어디가') — 양재·남부터미널 일대 맛집 평가 사내 웹 서비스. 사용자 10~20명, 식당 ~80개 규모의 소규모 서비스로, **월 운영비 0원(전부 무료 티어)** 이 핵심 제약이다. 유료 기능·플랜 도입 금지.

기획·데이터 모델·화면 흐름의 단일 출처는 `doc/plan/spec/yangjai_plan.html`. 모호하면 기획서를 따른다.

## 명령어

패키지 매니저는 **pnpm** (`packageManager` 필드로 고정).

```bash
pnpm dev                                    # 개발 서버 (http://localhost:5173)
pnpm build                                  # tsc -b + vite build
pnpm lint                                   # eslint
pnpm test                                   # vitest run (전체)
pnpm vitest run src/hooks/useRestaurantFilters.test.tsx   # 단일 테스트 파일
```

환경변수 (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`(또는 `VITE_SUPABASE_ANON_KEY`), `VITE_KAKAO_MAP_KEY`.

DB 스키마의 단일 출처는 `doc/db/schema.sql`(멱등 DDL), 사람용 문서는 `doc/db/table-spec.html`(테이블정의서). 스키마 변경 절차: schema.sql 수정 → 변경 구문만 **사용자가 Supabase SQL Editor에서 수동 실행** → 테이블정의서 동기화. 코드는 스키마 미적용 상태(테이블/뷰/RPC 부재)에서도 동작하도록 폴백을 갖춘다. (구 `supabase/migrations/` 이력은 2026-09-03 종료 — git 이력에서 열람 가능.)

## 아키텍처

**스택**: Vite + React 19 + TypeScript + Tailwind 4 / Supabase (PostgreSQL, RLS, Storage — 정식 Auth 없음) / Kakao Map JS SDK / Vercel 배포 (SPA rewrite는 `vercel.json`).

**레이어 흐름**: `pages/` → `hooks/` (TanStack Query 래퍼) → `api/` (Supabase 쿼리 + Zod 검증) → `lib/supabase.ts` (단일 클라이언트).

### 익명 인증 모델 (핵심)

정식 Auth 없이 닉네임만으로 식별한다. 여러 파일에 걸친 구조:

1. `src/store/nicknameStore.ts` — Zustand persist. "나"의 단일 출처 (`nickname` + `reviewerId` UUID). 첫 평가 성공 시 `setIdentity()` 호출.
2. `src/lib/supabase.ts` — fetch 래퍼가 매 요청마다 store에서 `reviewerId`를 읽어 `x-reviewer-id` 헤더를 주입.
3. RLS 정책(마이그레이션 SQL)이 `request.headers`의 `x-reviewer-id`를 검증해 본인 평가만 UPDATE/DELETE 허용.

1인 N평가 허용이지만 평균은 닉네임별 최신 1건만 반영(뷰 `restaurant_stats`). 분당 1·시간당 10 rate-limit은 DB 트리거가 ERRCODE 54000으로 차단하며 사용자용 메시지도 트리거가 제공한다.

### Zod 컨트랙트 + 방어적 폴백

- `src/types/domain.ts`가 DB 스키마의 컨트랙트. 모든 Supabase 응답은 `safeParse`로 검증 후 사용. enum(`CATEGORIES`, `SHEET_TYPES`, `RESTAURANT_STATUSES`)은 DB CHECK 제약과 쌍 — **enum 값 추가는 반드시 schema.sql 변경과 함께**.
- **지역은 역지오코딩된 동 이름** (2026-09-03 2차): 등록/수정 시 카카오 `coord2RegionCode`(법정동, `src/lib/kakao.ts`의 `getDongName`)로 `restaurants.region`에 저장. null(과거 데이터·역지오코딩 실패)이면 `useRestaurants`/`useRestaurant` 훅이 DB `regions` 기준점 최근접 계산(`src/utils/region.ts`)으로 폴백 합류. 지역 필터 UI는 제거됨 — 룰렛은 내 위치 3km 반경(`useGeolocation` + `distanceKm`).
- `api/` 모듈들은 테이블 부재(`missingTable`), 뷰 부재(평점 0 폴백), RPC 미배포(클라이언트 추첨 폴백)를 각각 구분해 처리한다. 이 패턴을 새 쿼리에서도 유지할 것.

### 반응형 이중 레이아웃 (1024px 분기)

`src/routes.tsx` + `src/pages/HomeWorkspaceLayout.tsx`:

- `/`와 `/restaurants/:id`는 `HomeWorkspaceLayout` 공유 레이아웃 아래 묶임.
- **모바일(<1024px)**: 레이아웃은 `<Outlet/>`만 렌더 → 기존 `HomePage` / `RestaurantDetailPage`.
- **데스크톱(≥1024px)**: 네이버 지도 포맷 워크스페이스 `[SideRail | 리스트 패널 | 상세 패널(Outlet) | 카카오맵]`. 상세가 열리고 닫혀도 지도·목록이 언마운트되지 않는다.
- CSS hidden이 아니라 `useMediaQuery` 조건부 렌더 — 모바일에서 카카오 SDK가 아예 로드되지 않게 하기 위함. 같은 라우트가 뷰포트에 따라 다른 컴포넌트를 렌더하므로 화면 작업 시 양쪽 모두 확인.

### 기타 규칙

- 폐업 처리도 soft delete — `status` 전이만 하고 평가 데이터는 보존.
- 디자인 토큰은 `src/index.css`의 Tailwind 4 `@theme` 디렉티브 (`bg-brand-primary`, `text-ink-500` 등).
- 사진 첨부는 클라이언트에서 1024px 리사이즈·JPEG 0.8 압축 후 Supabase Storage `rating-photos` 버킷에 저장 (`src/utils/photoResize.ts`).
- 식당 ~80건 규모라 정렬·필터는 클라이언트 처리로 충분 — 서버 최적화 도입 전 규모를 먼저 고려.
- 코드 주석·문서는 한국어로 작성하며 기획서 섹션(§)이나 task 번호를 참조하는 관례가 있다.

## 주의가 필요한 변경 (doc/agent/ROLES.md)

아래는 임의 진행하지 말고 사용자 확인 후 변경:

- `vite.config.*`, `tsconfig.*`, `eslint.config.*`, `package.json`의 scripts/dependencies
- DB 스키마·RLS 정책의 중대한 변경 (테이블 추가/삭제, 정책 완화, Storage 버킷 신설)
- Vercel·Supabase 프로젝트 설정, `vercel.json`
- 무료 티어 한도를 위협하는 결정 (인덱스 폭증, 큰 바이너리 저장, 잦은 백그라운드 작업)
