# 데스크톱 웹 레이아웃 (네이버 지도 포맷) — 설계 문서

- 작성일: 2026-08-12
- 상태: 확정 (구현 전)
- 배경: 현재 UI는 모바일 기준. 크롬·엣지 등 데스크톱 브라우저에서 볼
  네이버 지도 포맷(좌측 패널 + 전체화면 지도)의 웹 레이아웃이 필요하다.

## 결정 사항 (사용자 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| 전체 구조 | 네이버 풀 포맷: 아이콘 레일 + 리스트 패널(~400px) + 나머지 전체 지도 | 데스크톱(≥1024px)에서 BottomNav·AppHeader 숨김 |
| 상세 화면 | 목록 옆 두 번째 패널로 열림, 지도 유지 | URL은 `/restaurants/:id` 그대로, 라우팅 재정비 |
| 검색·필터 위치 | 전부 좌측 리스트 패널 상단 | 지도 위 오버레이 없음 |
| 모바일 | 기존 화면 100% 보존 | 브레이크포인트 lg=1024px, `useMediaQuery` 재사용 |

## 1. 라우팅 아키텍처

상세 패널이 열려도 지도·목록이 언마운트되지 않아야 하므로(카카오맵
재로딩·깜빡임 방지, 필터 상태 유지) `/`와 `/restaurants/:id`를 공유
레이아웃 라우트로 묶는다:

```tsx
// routes.tsx
<Route element={<HomeWorkspaceLayout />}>
  <Route index element={<HomeIndexRoute />} />
  <Route path="restaurants/:id" element={<RestaurantDetailRoute />} />
</Route>
// /restaurants/:id/edit, /roulette, /add, * 는 기존 그대로
```

- `HomeWorkspaceLayout` — `useMediaQuery('(min-width: 1024px)')` 분기.
  - 모바일: `<Outlet/>`만 렌더 → 기존 페이지 그대로.
  - 데스크톱: 워크스페이스(레일 + 리스트 패널 + 지도) 렌더,
    `<Outlet/>`은 상세 패널 슬롯.
- `HomeIndexRoute` — 데스크톱: `null`(패널 닫힘) / 모바일: 기존 `HomePage`.
- `RestaurantDetailRoute` — 데스크톱: `RestaurantDetailPanel` /
  모바일: 기존 `RestaurantDetailPage`.
- URL 체계 불변: 북마크·새로고침·공유 링크 모두 동일 동작.

## 2. 데스크톱 워크스페이스 (lg ≥ 1024px)

```
┌──┬──────────┬─────────┬──────────────┐
│레│ 검색창    │ (상세    │              │
│일│ 지역/끼니  │  패널)   │   지도 (전체)  │
│  │ 카테고리칩 │ ★4.6    │      📍📍    │
│홈│──────────│ 사진·평가 │   📍         │
│룰│ 식당카드↕ │  [닫기X] │              │
│등│ (내부스크롤)│         │              │
└──┴──────────┴─────────┴──────────────┘
 64px   400px     400px       flex-1
```

- 컨테이너: `h-dvh overflow-hidden flex` — 페이지(body) 스크롤 없음,
  각 패널이 내부 스크롤(`overflow-y-auto`).
- **`SideRail`** (신설, `src/components/layout/SideRail.tsx`)
  — 상단 로고 + 홈 / 오늘뭐먹지 / 등록 세로 아이콘 네비.
  nav 항목은 BottomNav와 공용 상수로 추출해 공유.
- **`RestaurantListPanel`** (신설)
  — 상단 고정: 검색창, 지역/끼니 토글, 휴·폐업 체크, 카테고리 칩,
    정렬 SortPill + 건수.
  — 아래: RestaurantCard 목록 (기존 카드·10건 페이징·IntersectionObserver
    센티넬 재사용).
- **`RestaurantDetailPanel`** (신설)
  — 상세 본문을 `RestaurantDetailContent`로 추출해 모바일
    `RestaurantDetailPage`와 공유.
  — 패널 헤더: 식당명 + 닫기(X) → `navigate('/')`.
  — 패널 내 미니 지도는 **제거** (우측 전체 지도가 해당 식당을
    포커스하므로 중복).
  — ⋯ 액션(정보 수정/휴업/폐업)은 1차에서 ActionSheet 그대로 재사용,
    드롭다운 전환은 추후 폴리시.
- **`useRestaurantFilters`** (신설 훅)
  — 필터 상태(keyword/sheetType/categories/showInactive/sortKey) +
    filtered/sorted useMemo + filterKey 리셋 로직을 HomePage에서 추출.
    모바일 HomePage와 데스크톱 ListPanel이 공유 (중복 제거).

## 3. 지도 연동 (`KakaoMapView` 확장)

- `selectedId?: string` prop 추가 — 선택 식당 마커 강조 + `setCenter`
  이동 (상세 패널 열림과 연동).
- 컨테이너 `ResizeObserver` → `map.relayout()` 호출 — 상세 패널
  열림/닫힘으로 지도 폭이 변할 때 대응 (relayout 호출 지점은 기존에 존재).
- 마커 클릭 → `navigate('/restaurants/:id')` (기존 동작 유지, 패널 열림).

## 4. 나머지 페이지 (룰렛 / 등록 / 수정 / 404)

- AppShell + 중앙 정렬(max-w-screen-md) 유지.
- AppShell 수정:
  - 데스크톱에서 `SideRail` 노출 (전 페이지 공통 네비).
  - `BottomNav`는 `lg:hidden`.
  - fixed 헤더·main에 레일 폭 보정 (`lg:pl-16` / `lg:left-16`).

## 5. 정리·마이그레이션 사항

- **현재 미커밋 변경 대체**: AppShell `wide` prop, HomePage lg 2단 grid는
  이 설계로 대체된다. `useMediaQuery` 훅만 유지, 나머지는 재작업.
- PullToRefresh·"맨위로" 버튼은 모바일 전용 유지 (워크스페이스 미장착).
- 데스크톱 목록 새로고침은 react-query 자동 refetch에 위임
  (패널 새로고침 버튼은 선택 폴리시).

## 6. 검증

- `pnpm build` + `pnpm lint` 통과.
- 수동 QA: 1024px 경계 리사이즈, 상세 패널 열림/닫힘 시 지도 relayout,
  `/restaurants/:id` 직접 진입, 모바일 화면 회귀 없음 확인.
- `doc/qa-scenarios.md`에 데스크톱 시나리오 추가.

## 관련 설계와의 순서

`2026-08-12-region-split-design.md`(지역 확대)가 선행 —
지역 작업이 DB+타입 중심으로 독립적이고 작다.
RegionToggle은 레이아웃 작업 시 ListPanel 필터 영역으로 이동한다.

구현 순서: **① 지역(양재/남부터미널) → ② 데스크톱 레이아웃**
