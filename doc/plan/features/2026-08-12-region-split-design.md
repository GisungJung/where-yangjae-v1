# 지역 확대: 양재 / 남부터미널 구분 — 설계 문서

- 작성일: 2026-08-12
- 상태: 구현 완료 (2026-08-12, DB 마이그레이션 적용됨)
  → **2026-09-03 `2026-09-03-region-derived-design.md`로 대체 예정** (enum 저장 → 기준점 테이블 + 최근접 파생)
- 배경: 서비스 대상 지역이 확대되어 식당 데이터를 **양재 / 남부터미널** 두 지역으로
  구분해 보여줘야 한다.

## 결정 사항 (사용자 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| 지역 부여 방식 | `restaurants.region` 컬럼 + 등록/수정 폼에서 직접 선택 | 좌표 자동판별은 경계 오분류 위험, 과거 `direction` 컬럼 제거 전례와 일관 |
| UI 노출 방식 | 홈 상단 지역 토글 필터 `전체 \| 양재 \| 남부터미널` | 기존 sheet_type 토글과 동일 패턴, 목록·지도·룰렛에 적용 |
| 기존 데이터(~120건) | 마이그레이션에서 좌표 기반 1회 분류 | 좌표 없는 행은 '양재' 기본값, 오분류는 수정 폼으로 교정 |

## 1. 데이터 모델 — DB 마이그레이션

새 파일: `supabase/migrations/20260812000001_add_region.sql`

1. **컬럼 추가**

   ```sql
   ALTER TABLE restaurants
     ADD COLUMN region text NOT NULL DEFAULT '양재'
     CHECK (region IN ('양재', '남부터미널'));
   ```

2. **좌표 기반 1회 백필** — 양재역(37.4842, 127.0344)과
   남부터미널역(37.4765, 127.0048) 중 가까운 역으로 배정.
   두 역이 같은 위도대라 PostGIS 없이 degree 거리² 비교로 충분
   (경도차에 cos(위도) 보정). 좌표 없는 행은 '양재' 유지.

3. **RPC 갱신** — `pick_random_restaurant`에 `p_region text DEFAULT NULL`
   파라미터 추가 (기존 패턴대로 DROP 후 재생성 + `GRANT EXECUTE` 재부여,
   `WHERE (p_region IS NULL OR region = p_region)` 조건 추가).

4. 마이그레이션 말미에 검증 쿼리 주석 (`SELECT region, count(*) ... GROUP BY region`)
   — 기존 마이그레이션 스타일 유지.

- `restaurant_stats` 뷰는 id 기준 집계라 **변경 불필요**.
- `category_counts` RPC는 클라이언트 호출부가 없어 **범위 제외** (YAGNI).
- CHECK 제약이므로 향후 지역 추가는 마이그레이션으로만 (category/sheet_type과 동일 정책).

## 2. 타입 / API 컨트랙트

- `src/types/domain.ts`
  - `REGIONS = ['양재', '남부터미널'] as const` + `Region` 타입 + `RegionSchema`
  - `RestaurantSchema`에 `region: RegionSchema.default('양재')`
    (DB 마이그레이션 미적용 상태 방어 — 파일 내 기존 패턴과 동일)
  - `NewRestaurantInputSchema`에 `region` 필수 필드 추가
- `src/types/database.ts` — restaurants Row/Insert/Update + RPC Args에
  `region` / `p_region` 반영
- `src/api/restaurants.ts`
  - `insertRestaurant` / `updateRestaurant` payload에 `region`
  - `UpdateRestaurantInput` Pick 목록에 `region` 추가
  - `pickRandomRestaurant` input에 `region` 추가 — RPC 호출과
    RPC 미배포 시 클라이언트 폴백 필터 **양쪽** 적용

## 3. 홈 화면 (`src/pages/HomePage.tsx`)

- **`RegionToggle` 컴포넌트 신설** (`src/components/restaurant/RegionToggle.tsx`)
  — `SheetTypeToggle`과 동일한 pill 토글 패턴, `전체 | 양재 | 남부터미널`
- 배치: sticky 필터 영역에서 **별도 행** (모바일 375px에서 지역+끼니
  토글을 한 행에 두면 overflow)
- `filtered` useMemo와 `filterKey` 문자열에 region 추가 → 페이지 리셋·
  지도 마커·건수 카운트는 기존 파이프라인에 자동 반영
- EmptyState의 `hasFilters` 판정과 `onClearFilters`에 region 포함
- **`RestaurantCard` 배지 행에 지역 chip 추가** — 항상 표시
  ('전체' 모드에서 구분 가능해야 함)
- 우측 카카오맵은 `sorted` 기반이라 자동 필터링. 지역 전환 시 지도
  재센터링은 KakaoMapView의 bounds fit 동작 확인 후 구현 단계에서 결정

## 4. 등록 / 수정 / 상세

- `AddRestaurantPage`: 지역 세그먼트 선택 필드 (기본값 '양재', 필수)
- `EditRestaurantPage`: 기존값 로드 + 수정 가능 — 좌표 백필 오분류의 교정 경로
- `RestaurantDetailPage`: 지역 배지 표시

## 5. 룰렛 (`src/pages/RoulettePage.tsx`)

- idle 화면에 지역 선택 토글 추가 (전체/양재/남부터미널, 기본 '전체')
- 선택값을 `pickRandomRestaurant`에 전달 — RPC `p_region`와 클라 폴백 모두 필터

## 6. 검증

- `pnpm build` (tsc -b + vite build), `pnpm lint` 통과
- 백필 결과는 마이그레이션 검증 쿼리로 확인
- `doc/qa-scenarios.md`에 지역 필터 시나리오 추가

## 열린 질문 (이번 범위 외)

- 앱 이름 "양재어디가" / 헤더 브랜딩은 유지. 지역이 더 늘어나면 재논의.

## 구현 노트 (2026-08-12)

- 마이그레이션 원격 적용 완료 — 백필 결과: **양재 124 / 남부터미널 1** (좌표 없는 6건은 기본값 '양재').
  남부터미널로 분류된 1건(텍사스데브라질)은 고속터미널 인근 원거리 좌표 이상치 — 필요 시 수정 폼에서 교정.
- 지역 토글은 설계 당시의 HomePage 외에 데스크톱 워크스페이스 `RestaurantListPanel`에도 동일 적용
  (2026-08-12 데스크톱 레이아웃 작업으로 필터가 `useRestaurantFilters` 훅으로 이동).
- ✅ 해결됨(2026-08-12): 위 이력 어긋남 조사 결과 `20260515065715`는 `20260515000004`
  (reviewers unique 완화)와 동일 내용이 다른 버전 번호로 적용된 것. 실제 미적용은
  `000001(평가 dedup·rate-limit)/000002(rating_photos·storage)/000003(direction 제거)` 3건.
  → direction 값 76행 백업 후 3건 순차 적용, 이력 repair(000001~04 applied 기록, 065715 제거),
  리포 생성 전 초기 3건(`20260514120001~3` init/rls/seed)은 원격 이력에서 로컬 파일로 복원.
  로컬↔원격 이력 13건 1:1 정렬 완료, rate-limit 트리거·stats 정규화·사진 인프라 동작 검증 완료.
  사진 업로드 기능이 이제 프로덕션 DB에서 동작한다.
- 좌표 정정(2026-08-12): 백필에 쓴 남부터미널역 좌표(37.4765, 127.0048)가 잘못됨 —
  올바른 좌표는 **(37.485013, 127.016189)** (사용자 제공). `20260812000002`로 전면 재분류
  (결과 동일: 양재 124 / 남부터미널 1), 지도 센터 상수(`NAMBU_TERMINAL_STATION`)도 갱신.
