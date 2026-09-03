# 지역 파생 구조 전환 — 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: superpowers:executing-plans 로 태스크 단위 실행.
> 설계 문서: `doc/plan/features/2026-09-03-region-derived-design.md`

**Goal:** 지역을 저장 enum에서 `regions` 기준점 테이블 + 최근접 파생으로 전환. 새 지역 추가 = SQL INSERT 한 줄, 코드 수정 0.

**Architecture:** DB에 `regions(name, lat, lng, sort_order)` 신설, `restaurants.region` 컬럼은 유지하되 코드에서 미사용(DEPRECATED). 파생 지역은 `useRestaurants`/`useRestaurant` 훅에서 `nearestRegion()`으로 한 번만 계산해 `RestaurantWithStats.region`에 합류 — 하위 컴포넌트는 기존처럼 `r.region`만 읽는다. `RegionFilter`는 `'all' | 지역이름` string으로 일반화.

**Tech Stack:** 기존 스택 그대로 (Vite/React 19/TS/TanStack Query/Zod/Supabase). 신규 의존성 없음.

---

### Task 1: DB 마이그레이션 SQL 산출

> 2026-09-03 후속: 마이그레이션 이력 관리 종료 — 산출된 DDL은 `doc/db/schema.sql`로 통합됨.

**Files:**
- Create: ~~`supabase/migrations/20260903000001_regions_table.sql`~~ → `doc/db/schema.sql` §2.5·§6·§7.5

내용 (기존 마이그레이션 주석 스타일 준수):
1. `regions` 테이블 + RLS(`SELECT` anon만) + 시드 2행(양재역 37.4842/127.0344, 남부터미널역 37.4765/127.0048, sort_order 1·2)
2. `restaurants.region` 컬럼 `COMMENT`를 DEPRECATED로 변경 (DROP 안 함)
3. `pick_random_restaurant` RPC 재정의: `p_region` 비교를 컬럼 → 최근접 기준점 계산으로. 좌표 없는 행은 지역 필터 시 제외. 거리 공식은 20260812000001 백필과 동일(degree² + cos 보정)

검증: SQL 산출만 (원격 적용은 사용자 수동 — CLAUDE.md 관례). 문법 확인은 육안 + 트랜잭션 블록 확인.

### Task 2: `nearestRegion` 유틸 (TDD)

**Files:**
- Create: `src/utils/region.ts`
- Test: `src/utils/region.test.ts`

**Step 1:** 실패하는 테스트 작성 — 케이스 4개:
- 양재역 근처 좌표 → '양재'
- 남부터미널역 근처 좌표 → '남부터미널'
- lat/lng null → null
- regions 빈 배열 → null

**Step 2:** `pnpm vitest run src/utils/region.test.ts` → FAIL 확인

**Step 3:** 구현 — `nearestRegion(lat: number | null, lng: number | null, regions: readonly RegionPoint[]): string | null`. 공식: `(latΔ)² + (lngΔ·cos(radians(37.48)))²` 최소인 지역 이름. `RegionPoint = { name, lat, lng }`.

**Step 4:** 테스트 PASS 확인.

### Task 3: 타입·API·훅·UI 일괄 전환 (원자적 — 중간 상태는 컴파일 불가)

**Files:**
- Modify: `src/types/domain.ts` — `REGIONS`·enum `RegionSchema`·`Region` 제거 → `RegionSchema = z.object({ name, lat, lng, sort_order })` 객체 스키마로 교체. `RestaurantSchema`에서 `region` 필드 제거(Zod가 응답의 잔존 컬럼 strip). `NewRestaurantInputSchema`에서 `region` 제거. `RestaurantWithStats`에 `region: string | null` 추가.
- Modify: `src/types/database.ts` — `regions` 테이블 Row/Insert/Update 추가. `restaurants` 타입의 `region`은 유지(컬럼 존재).
- Create: `src/api/regions.ts` — `fetchRegions()`: 테이블 부재 시 `FALLBACK_REGIONS`(양재역·남부터미널역 상수) 반환, `RegionSchema.safeParse` 검증, `sort_order` 정렬.
- Create: `src/hooks/useRegions.ts` — TanStack Query, staleTime 30분, `regionsKeys`.
- Modify: `src/hooks/useRestaurants.ts` — `useRestaurants`/`useRestaurant`에서 `useRegions` 결과와 조합해 `region: nearestRegion(...)` 합류 (useMemo).
- Modify: `src/api/restaurants.ts` — insert/update payload에서 `region` 제거. `pickRandomClientFallback`: `fetchRegions()` 후 `nearestRegion`으로 필터.
- Modify: `src/components/restaurant/RegionToggle.tsx` — `regions: Region[]` prop 추가, `RegionFilter = string`('all' 포함), 지역 ≤1개면 null 렌더.
- Modify: `src/pages/HomePage.tsx`, `src/components/restaurant/RestaurantListPanel.tsx` — `<RegionToggle regions={...}>` 전달 (useRegions).
- Modify: `src/pages/HomeWorkspaceLayout.tsx` — `NAMBU_TERMINAL_STATION` 하드코딩 분기 → regions에서 `filters.region` 이름으로 좌표 조회, 폴백 `YANGJAE_STATION`.
- Modify: `src/lib/kakao.ts` — `NAMBU_TERMINAL_STATION` 상수 제거 (`YANGJAE_STATION`은 기본 폴백으로 유지).
- Modify: `src/pages/RoulettePage.tsx` — 지역 SegmentedToggle 옵션을 useRegions로 동적 생성.
- Modify: `src/pages/AddRestaurantPage.tsx`, `src/pages/EditRestaurantPage.tsx` — `region` state·radiogroup·payload 제거.
- Modify: `src/hooks/useRestaurantFilters.test.tsx` — mk()의 region은 그대로(파생 필드로 타입 유지), enum import 제거.

검증: `pnpm test` PASS, `pnpm build` PASS, `pnpm lint` PASS.

### Task 4: 폼 파생 지역 안내 UI

**Files:**
- Modify: `src/pages/AddRestaurantPage.tsx` — 카카오 장소 선택 박스에 파생 지역 안내 추가: 좌표 있으면 "📍 ○○ 지역으로 표시됩니다", 없으면 "지역 미지정 — '전체' 필터에서만 노출됩니다".
- Modify: `src/pages/EditRestaurantPage.tsx` — 동일 안내 (현재 좌표 기준).

검증: `pnpm build`.

### Task 5: 최종 검증 + 문서 갱신

- `pnpm lint && pnpm test && pnpm build` 전체 PASS.
- `doc/plan/features/2026-09-03-region-derived-design.md` 상태 → "구현 완료 (DB 마이그레이션 적용 대기)".
- `CLAUDE.md` — REGIONS enum 언급을 파생 구조 설명으로 갱신.
- 사용자 안내: `doc/db/schema.sql`의 regions 관련 구문(§2.5·§6·§7.5) 수동 적용 필요 (미적용 시).

**커밋 정책:** 작업 트리에 이번 건과 무관한 미커밋 변경(doc 재구성, CLAUDE.md)이 있어 커밋은 사용자 확인 후 일괄 진행.
