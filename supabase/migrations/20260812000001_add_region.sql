-- ============================================================================
-- 20260812000001_add_region.sql
-- 지역 확대: 양재 / 남부터미널 구분
-- 설계: doc/plan/2026-08-12-region-split-design.md
--   1) restaurants.region 컬럼 추가 (CHECK 제약, 기본 '양재')
--   2) 좌표 기반 1회 백필 — 양재역 vs 남부터미널역 근접 비교
--   3) pick_random_restaurant RPC에 p_region 파라미터 추가 (룰렛 지역 필터)
-- restaurant_stats 뷰는 id 기준 집계라 변경 불필요.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 컬럼 추가 — 기존 행은 일단 '양재'
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN region text NOT NULL DEFAULT '양재'
  CONSTRAINT restaurants_region_check CHECK (region IN ('양재', '남부터미널'));

COMMENT ON COLUMN public.restaurants.region IS
  '서비스 지역 구분. 등록/수정 폼에서 직접 선택 (양재 | 남부터미널).';

-- ----------------------------------------------------------------------------
-- 2. 좌표 기반 1회 백필
--    양재역(37.4842, 127.0344) vs 남부터미널역(37.4765, 127.0048) 중
--    가까운 역으로 배정. 두 역이 같은 위도대(±0.008°)라 PostGIS 없이
--    degree 거리² 비교로 충분 — 경도차에만 cos(위도) 보정.
--    좌표 없는 행은 DEFAULT '양재' 유지 (수정 폼에서 개별 교정 가능).
-- ----------------------------------------------------------------------------
UPDATE public.restaurants
SET region = '남부터미널'
WHERE lat IS NOT NULL
  AND lng IS NOT NULL
  AND (
    power(lat - 37.4765, 2) + power((lng - 127.0048) * cos(radians(37.48)), 2)
  ) < (
    power(lat - 37.4842, 2) + power((lng - 127.0344) * cos(radians(37.48)), 2)
  );

-- ----------------------------------------------------------------------------
-- 3. pick_random_restaurant — p_region 파라미터 추가
--    기존 시그니처를 명시적으로 DROP 후 재생성 (20260514120007 패턴).
--    p_region이 NULL이면 지역 무관 (기존 호출과 하위호환).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pick_random_restaurant(text, text[], boolean);

CREATE OR REPLACE FUNCTION public.pick_random_restaurant(
  p_sheet_type text DEFAULT NULL,         -- 'lunch' | 'dinner' | NULL(둘 다)
  p_categories text[] DEFAULT NULL,       -- NULL이면 카테고리 무관
  p_include_closed boolean DEFAULT false, -- false면 휴업·폐업 제외 (= 운영중만)
  p_region text DEFAULT NULL              -- '양재' | '남부터미널' | NULL(전체)
)
RETURNS SETOF public.restaurants
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.restaurants
  WHERE (p_sheet_type IS NULL OR sheet_type = p_sheet_type)
    AND (p_categories IS NULL OR category = ANY(p_categories))
    AND (p_include_closed OR status = '운영중')
    AND (p_region IS NULL OR region = p_region)
  ORDER BY random()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pick_random_restaurant(text, text[], boolean, text) IS
  '룰렛용 랜덤 단건 추천. p_include_closed=false면 status=운영중만, p_region으로 지역 필터. 0건이면 빈 결과.';

GRANT EXECUTE ON FUNCTION public.pick_random_restaurant(text, text[], boolean, text)
  TO anon, authenticated;

COMMIT;

-- ----------------------------------------------------------------------------
-- 검증 쿼리 (적용 후 수동 확인용)
-- ----------------------------------------------------------------------------
-- SELECT region, count(*) FROM restaurants GROUP BY region;
--   → 양재/남부터미널 분포 확인 (남부터미널 인근 좌표 식당이 재배정됐는지)
-- SELECT name, lat, lng, region FROM restaurants
--  WHERE region = '남부터미널' ORDER BY name;
-- SELECT * FROM pick_random_restaurant('lunch', NULL, false, '남부터미널');
