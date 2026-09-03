# 지역 구조 개선: 기준점 테이블 + 파생 지역 — 설계 문서

- 작성일: 2026-09-03
- 상태: 구현 완료 (2026-09-03)
- 배경: 지역이 `'양재' | '남부터미널'` enum으로 DB CHECK + 코드 상수 + 지도
  좌표까지 하드코딩되어 있어 (1) 새 지역 추가마다 전부 수정 필요, (2) 경계가
  자의적, (3) 등록 시 좌표가 있는데도 지역을 수동 선택해야 하는 문제가 있다.
- 선행 문서: `2026-08-12-region-split-design.md` (지역 개념 도입 — 본 설계가 대체)

## 결정 사항 (사용자 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| 접근 방식 | `regions` 기준점 테이블 + 최근접 파생 (A안) | 저장 컬럼 유지(B안)·거리 기반 UX(C안) 대신 선택 |
| `restaurants.region` 컬럼 | **DROP 하지 않고 유지** (코드에서만 미사용) | 안전 우선. DEPRECATED 코멘트만. 정리는 추후 별도 마이그레이션 |
| 좌표 없는 식당 | 지역 미지정 (`null`) — '전체' 필터에서만 노출 | 뱃지 생략, 폼에서 안내 |
| 지역 추가 주체 | 관리자 SQL `INSERT` 한 줄 | regions 쓰기 RLS 정책 없음 |

## 1. 데이터 모델 — DB 변경

> 2026-09-03 후속: 마이그레이션 이력 관리가 종료되어 아래 DDL은
> `doc/db/schema.sql` (§2.5 regions, §6 RPC)로 통합됨.

1. **`regions` 테이블 신설**

   ```sql
   CREATE TABLE public.regions (
     name       text PRIMARY KEY,          -- '양재', '남부터미널'
     lat        double precision NOT NULL, -- 기준점(역) 좌표
     lng        double precision NOT NULL,
     sort_order int NOT NULL DEFAULT 0,    -- 토글 버튼 순서
     created_at timestamptz NOT NULL DEFAULT now()
   );
   ```

   - RLS: `SELECT`만 anon 허용. 쓰기 정책 없음.
   - 시드: 양재역(37.4842, 127.0344), 남부터미널역(37.4765, 127.0048)
     — 20260812000001 백필 좌표와 동일.

2. **`restaurants.region`** — 유지. `COMMENT`로 DEPRECATED 표시만.
   `DEFAULT '양재'`가 있어 클라이언트가 region을 보내지 않아도 INSERT 동작.

3. **`pick_random_restaurant` RPC** — `p_region` 시그니처 유지, 내부를
   컬럼 비교 → 최근접 기준점 계산으로 변경. 거리 공식은 백필과 동일:
   `power(lat차,2) + power(lng차 * cos(radians(37.48)), 2)` 비교.
   좌표 없는 식당은 지역 필터 시 제외. ~80행 규모라 성능 무관.

## 2. 클라이언트 아키텍처

핵심 원칙: **파생 지역을 `useRestaurants`에서 한 번만 계산해 붙이고,
하위 컴포넌트는 기존처럼 `r.region`을 읽기만 한다.**

### 신규 파일

- `src/api/regions.ts` — `fetchRegions()`. 테이블 부재 시(마이그레이션
  미적용) 하드코딩 폴백 상수 `[양재역, 남부터미널역]` 반환 (방어적 폴백
  패턴 유지). `RegionSchema.safeParse` 검증.
- `src/utils/region.ts` — `nearestRegion(lat, lng, regions): string | null`.
  RPC·백필과 동일 공식. 좌표 없으면 `null`.
- `src/hooks/useRegions.ts` — TanStack Query, staleTime 길게.

### 변경

- `src/types/domain.ts` — `REGIONS` 상수·enum 제거,
  `RegionSchema = z.object({ name, lat, lng, sort_order })` 로 교체.
  `RestaurantSchema`에서 `region` 필드 제거 (Zod가 DB 응답의 잔존 컬럼을 strip).
  파생 지역은 `RestaurantWithStats.region: string | null` 로 합류.
- `src/hooks/useRestaurants.ts` — regions 로드 후 각 식당에
  `nearestRegion` 결과 합류 (stats 합류와 같은 위치).
- `src/hooks/useRestaurantFilters.ts` — 필터 비교 로직 변경 없음.
  토글 옵션 목록만 동적.
- `src/lib/kakao.ts` — 지역별 지도 중심을 regions 좌표로. 기본 중심
  폴백 상수(양재역)는 유지.
- `src/api/restaurants.ts` — INSERT/UPDATE payload에서 `region` 제거.

## 3. UI 변경

- **RegionToggle** — `useRegions()` 결과로 버튼 동적 생성 (`sort_order`
  순). `전체` 유지. 지역이 1개뿐이면 토글 숨김.
- **등록/수정 폼** — 지역 선택 UI 제거. 카카오 장소 선택 시
  "○○ 지역으로 표시됩니다" 읽기 전용 안내. 좌표 미선택 시
  "지역 미지정 — 전체에서만 노출" 안내.
- **카드·상세** — 변경 없음 (`r.region`이 `null`이면 뱃지 생략).
- **룰렛** — 지역 버튼 동적 목록. RPC `p_region`에 지역 이름 전달은 동일.

## 4. 엣지 케이스

| 상황 | 동작 |
|---|---|
| `regions` 테이블 미생성 | 클라이언트 폴백 상수 2개 지역으로 기존과 동일 동작 |
| 좌표 없는 식당 | `region: null` → '전체'에서만 노출, 뱃지 없음 |
| 두 기준점 등거리 | 목록 순서상 첫 기준점 (실질 발생 없음) |
| RPC 미배포 룰렛 | 기존 클라이언트 폴백 추첨이 파생 지역 기준으로 동작 |

## 5. 테스트 (vitest)

- `nearestRegion` 단위: 양재역 근처 / 남부터미널역 근처 / 좌표 `null` /
  regions 빈 배열.
- 필터 훅: 파생 지역 필터링, 미지정 식당이 '전체'에만 노출.

## 6. 새 지역 추가 절차 (개선 후)

```sql
INSERT INTO regions (name, lat, lng, sort_order) VALUES ('강남', 37.4979, 127.0276, 3);
```

코드 수정 없음. 토글 버튼·룰렛 필터·지도 중심·파생 분류 모두 자동 반영.
