# 데스크톱 네이버 포맷 레이아웃 — 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: superpowers:executing-plans 로 태스크 단위 실행.
> 설계 문서: `doc/plan/features/2026-08-12-desktop-naver-layout-design.md`

**Goal:** lg(≥1024px)에서 네이버 지도 포맷(아이콘 레일 + 리스트 패널 + 상세 패널 + 전체 지도) 워크스페이스를 제공한다. 모바일은 100% 현행 유지.

**Architecture:** `/`와 `/restaurants/:id`를 `HomeWorkspaceLayout` 공유 레이아웃 라우트로 묶어 데스크톱에서 지도·목록 언마운트를 방지. 필터 로직은 `useRestaurantFilters` 훅으로 추출해 모바일 HomePage와 데스크톱 ListPanel이 공유. 상세 본문은 `RestaurantDetailContent`로 추출해 페이지/패널이 공유.

**Tech Stack:** React 19 + react-router-dom 6 (layout route/Outlet), TanStack Query, Tailwind 4, Kakao Maps SDK, vitest(+jsdom, 신규 셋업).

---

### Task 0: 기존 미커밋 변경 체크포인트 커밋
- 미커밋 상태: `AppShell.tsx`(wide prop), `HomePage.tsx`(lg 2단 grid), `useMediaQuery.ts`(신규)
- lg-grid 방식은 본 설계로 대체되지만 이력 보존을 위해 WIP 체크포인트로 커밋 후 그 위에 재작업
- Commit: `wip: 홈 lg 2단 레이아웃 1차 시도 (데스크톱 워크스페이스로 대체 예정)`

### Task 1: 네비 항목 공용 상수 + SideRail + BottomNav lg 숨김
- Create: `src/components/layout/navItems.ts` — BottomNav의 ITEMS를 이동 (`NAV_ITEMS`)
- Create: `src/components/layout/SideRail.tsx` — `hidden lg:flex`, `fixed left-0 inset-y-0 w-16 z-30`,
  상단 로고(y 원형 + 홈 링크) + NAV_ITEMS 세로 아이콘 버튼(활성 = brand-primary)
- Modify: `BottomNav.tsx` — NAV_ITEMS 사용 + nav에 `lg:hidden`
- Verify: `pnpm build`

### Task 2: AppShell/AppHeader 데스크톱 보정 (비-홈 페이지용)
- Modify: `AppShell.tsx` — HEAD 기준으로 되돌리고(wide prop 제거) `<SideRail />` 추가,
  main에 `lg:pl-16` (레일 폭 보정)
- Modify: `AppHeader.tsx` — 두 header 모두 `lg:left-16` (fixed inset-x-0 보정)
- Modify: `HomePage.tsx` — Task 0에서 커밋된 lg-grid 코드 제거(HEAD 상태로 복원). 모바일 전용으로 회귀
- Verify: `pnpm build` + 룰렛/등록 페이지에서 레일 노출·헤더 오프셋 확인

### Task 3: useRestaurantFilters 훅 추출 + vitest 셋업 + 테스트
- Create: `src/hooks/useRestaurantFilters.ts`
  — keyword/sheetType/selectedCategories/showInactive/sortKey 상태,
    filtered/sorted useMemo, filterKey 변경 시 visibleCount 리셋,
    visible/hasMore/loadMore (PAGE_SIZE=10), SORT_OPTIONS export
- Modify: `vite.config.ts` — `test: { environment: 'jsdom' }`; `package.json` — `"test": "vitest run"`
- Test: `src/hooks/useRestaurantFilters.test.tsx` — renderHook 기반:
  ① 휴폐업 기본 제외 ② sheetType/카테고리/키워드 필터 ③ 정렬 3종
  ④ 필터 변경 시 visibleCount 리셋 ⑤ loadMore 증가
- Modify: `HomePage.tsx` — 훅 사용으로 리팩토링 (동작 불변)
- Verify: `pnpm test` PASS → `pnpm build`

### Task 4: KakaoMapView 확장 (selectedId + ResizeObserver)
- Modify: `KakaoMapView.tsx`
  — `selectedId?: string | null` prop: 변경 시 해당 마커로 `setCenter` (+`setLevel(3)`)
  — 컨테이너 ResizeObserver → `map.relayout()` (패널 열림/닫힘 폭 변화 대응)
  — 마커 이미지 차별화 강조는 폴리시로 보류 (SDK 타입 stub에 MarkerImage 없음)
- Verify: `pnpm build`

### Task 5: 라우팅 재구성 + HomeWorkspaceLayout 골격
- Create: `src/pages/HomeWorkspaceLayout.tsx`
  — `useMediaQuery('(min-width: 1024px)')`: 모바일 → `<Outlet />`만,
    데스크톱 → `h-dvh overflow-hidden flex` 워크스페이스: SideRail + ListPanel + Outlet(상세 슬롯) + 지도(flex-1)
  — 필터 훅 인스턴스는 레이아웃이 소유, `useMatch('/restaurants/:id')`로 selectedId 추출
- Modify: `routes.tsx`
  ```tsx
  <Route element={<HomeWorkspaceLayout />}>
    <Route index element={<HomeIndexRoute />} />        // wide? null : <HomePage/>
    <Route path="restaurants/:id" element={<RestaurantDetailRoute />} /> // wide? panel : page
  </Route>
  ```
- Verify: 모바일 뷰포트에서 기존 화면 회귀 없음, 데스크톱에서 골격 렌더

### Task 6: RestaurantListPanel
- Create: `src/components/restaurant/RestaurantListPanel.tsx`
  — `w-[400px] shrink-0 flex flex-col border-r`; 상단 고정: 검색창·끼니 토글·휴폐업 체크·
    카테고리 칩·건수+SortPill / 아래 `overflow-y-auto` 목록(RestaurantCard + 센티넬/더보기)
  — 빈 상태·에러·스켈레톤은 HomePage 것 재사용 가능하게 필요한 부분 추출
- Verify: `pnpm build` + 데스크톱에서 필터→지도 마커 연동 확인

### Task 7: RestaurantDetailContent 추출 + RestaurantDetailPanel
- Modify: `RestaurantDetailPage.tsx` — 본문(article + ActionSheet + ConfirmDialog + 상태 mutation)을
  `src/components/restaurant/RestaurantDetailContent.tsx`로 추출, `showMiniMap` prop (페이지 true / 패널 false)
- Create: `src/components/restaurant/RestaurantDetailPanel.tsx`
  — `w-[400px] shrink-0 border-r overflow-y-auto` + 패널 헤더(식당명 + X → `navigate('/')`)
- Verify: 모바일 상세 회귀 없음 + 데스크톱 패널 열림/닫힘 + 지도 relayout

### Task 8: 통합 폴리시 + 검증
- 마커 클릭 → `/restaurants/:id`, 카드 클릭 동일, 선택 마커 센터링
- `pnpm lint` + `pnpm test` + `pnpm build` 전체 통과
- `doc/qa-scenarios.md`에 데스크톱 시나리오 추가
- 최종 커밋

각 Task 완료 시 개별 커밋. 커밋 메시지는 한국어, 기존 컨벤션(`feat:`/`refactor:`/`docs:`) 준수.
