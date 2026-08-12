-- ============================================================================
-- 20260514120007_rpc.sql
-- 클라이언트(supabase-js)에서 호출할 RPC 함수 정의.
--   R1) pick_random_restaurant(p_sheet_type, p_categories, p_include_closed)
--       → 룰렛(/roulette)에서 단건 랜덤 추천. 0건이면 빈 결과(에러 아님).
--   R2) category_counts(p_sheet_type)
--       → 홈 카테고리 chip 옆 식당 수 노출용.
-- 둘 다 STABLE / SECURITY INVOKER. anon·authenticated 모두 EXECUTE 허용.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- R1. pick_random_restaurant
-- ----------------------------------------------------------------------------
-- 기존 정의가 있다면 시그니처 변경 가능성에 대비해 명시적으로 DROP.
DROP FUNCTION IF EXISTS public.pick_random_restaurant(text, text[], boolean);

CREATE OR REPLACE FUNCTION public.pick_random_restaurant(
  p_sheet_type text DEFAULT NULL,         -- 'lunch' | 'dinner' | NULL(둘 다)
  p_categories text[] DEFAULT NULL,       -- NULL이면 카테고리 무관
  p_include_closed boolean DEFAULT false  -- false면 휴업·폐업 제외 (= 운영중만)
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
  ORDER BY random()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pick_random_restaurant(text, text[], boolean) IS
  '룰렛용 랜덤 단건 추천. p_include_closed=false면 status=운영중만. 0건이면 빈 결과.';

GRANT EXECUTE ON FUNCTION public.pick_random_restaurant(text, text[], boolean)
  TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- R2. category_counts
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.category_counts(text);

CREATE OR REPLACE FUNCTION public.category_counts(
  p_sheet_type text DEFAULT NULL
)
RETURNS TABLE(category text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT category, count(*)::bigint
  FROM public.restaurants
  WHERE (p_sheet_type IS NULL OR sheet_type = p_sheet_type)
    AND status = '운영중'
  GROUP BY category
  ORDER BY count(*) DESC, category;
$$;

COMMENT ON FUNCTION public.category_counts(text) IS
  '운영중 식당 기준 카테고리별 카운트. p_sheet_type으로 lunch/dinner 필터.';

GRANT EXECUTE ON FUNCTION public.category_counts(text)
  TO anon, authenticated;

COMMIT;
