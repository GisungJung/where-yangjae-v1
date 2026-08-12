-- ============================================================================
-- Migration : 20260515000001_ratings_dedup_softcap.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : 1인 1평가 제한 제거 + 어뷰즈 관리 (사용자 결정안 c+b 채택).
--
--   (1) ALTER TABLE public.ratings
--         DROP CONSTRAINT ratings_restaurant_reviewer_unique
--       → 한 사용자가 같은 식당에 평가를 여러 번 남길 수 있게 허용.
--
--   (2) public.restaurant_stats 뷰 재정의 — "평균 정규화"
--       동일 reviewer가 같은 식당에 여러 평가를 남기더라도, 평균 계산에는
--       reviewer_id별 **최신 1건만** 반영하여 도배에 의한 평균 왜곡을 차단.
--       rating_count도 행 수가 아니라 평가한 "고유 사용자 수"가 된다.
--       응답 컬럼 shape(id, name, rating_count, avg_score)은 그대로 유지하여
--       클라이언트(src/api/restaurants.ts) 변경 없이 호환된다.
--
--   (3) BEFORE INSERT 트리거 — 소프트 rate-limit
--       reviewer_id별 최근 1분 1회·최근 1시간 10회 초과 시 RAISE EXCEPTION.
--       INSERT 경로에만 적용 (UPDATE는 ratings_update_own RLS가 본인만 허용).
--
-- 기획서 SSOT 변경 동반 필요 (담당 외 — 사용자/dev):
--   doc/plan/yangjai_plan.html §6.4 "UNIQUE(restaurant_id, reviewer_id) — 1인 1평가 강제"
--   doc/plan/yangjai_plan.html §리스크표 익명 어뷰징 행 "UNIQUE 제약" 문구
--   → 본 마이그레이션 적용과 동시에 갱신 필요.
--
-- 적용 후 자가 점검은 본 파일 끝의 주석 블록 (ROLES.md §2) 참조.
-- 원격 직접 적용 금지 — 사용자가 supabase migration up으로 적용.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. UNIQUE 제약 제거
-- ---------------------------------------------------------------------------
-- 멱등성: 제약 이름이 존재하지 않으면 NOTICE만 띄우고 통과.
ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_restaurant_reviewer_unique;

-- UNIQUE 인덱스가 같이 사라지므로 (restaurant_id, reviewer_id) 조회 가속이
-- 필요한 경우를 위해 보조 인덱스를 추가한다.
-- (RatingForm의 'hasMyRating' 계산이 reviewer_id별 평가 존재 확인에 사용.)
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_reviewer
  ON public.ratings (restaurant_id, reviewer_id);

COMMENT ON INDEX public.idx_ratings_restaurant_reviewer IS
  '1인 N평가 허용 환경에서 (restaurant_id, reviewer_id) 조회 가속.';


-- ---------------------------------------------------------------------------
-- 2. restaurant_stats 뷰 — 평균 정규화 (reviewer_id별 최신 1건만)
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW는 컬럼 추가만 가능. 본 변경은 SELECT 본문 교체이므로
-- DROP → CREATE 패턴을 사용한다. RLS 권한은 본 트랜잭션 안에서 GRANT 재부여.
DROP VIEW IF EXISTS public.restaurant_stats;

CREATE VIEW public.restaurant_stats AS
WITH latest_per_reviewer AS (
  -- 같은 (restaurant_id, reviewer_id) 짝에서 가장 최신 평가만 선택.
  -- created_at 동률은 id로 결정(uuid 비교는 무작위지만 결정적).
  SELECT DISTINCT ON (rt.restaurant_id, rt.reviewer_id)
    rt.restaurant_id,
    rt.reviewer_id,
    rt.score
  FROM public.ratings rt
  ORDER BY rt.restaurant_id, rt.reviewer_id, rt.created_at DESC, rt.id DESC
)
SELECT
  r.id,
  r.name,
  COUNT(l.reviewer_id)                  AS rating_count,
  ROUND(AVG(l.score)::numeric, 1)       AS avg_score
FROM public.restaurants r
LEFT JOIN latest_per_reviewer l ON l.restaurant_id = r.id
GROUP BY r.id, r.name;

COMMENT ON VIEW public.restaurant_stats IS
  '식당별 평가 수와 평균 별점(소수 1자리). 1인 N평가 허용 환경에서 '
  'reviewer_id별 최신 평가 1건만 평균에 반영(도배 평균 왜곡 방지). '
  'rating_count는 평가한 고유 사용자 수.';

-- 권한 복원 — 120008과 동일.
GRANT SELECT ON public.restaurant_stats TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT 트리거 — soft rate-limit
-- ---------------------------------------------------------------------------
-- 임계값:
--   * 1분 안에 이미 1건이 있으면 새 INSERT 거부 (= 1분 1회 허용)
--   * 1시간 안에 이미 10건이 있으면 새 INSERT 거부 (= 1시간 10회 허용)
-- SECURITY INVOKER — ratings RLS(120008)가 anon insert를 허용하므로 추가 권한
-- 없이 호출자(anon) 권한으로 충분히 같은 reviewer_id row를 셀 수 있다.
-- ERRCODE '54000' (program_limit_exceeded) — 클라이언트가 23505와 구분 가능.

CREATE OR REPLACE FUNCTION public.ratings_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_minute_count integer;
  v_hour_count   integer;
BEGIN
  -- 1분 윈도우
  SELECT count(*)
    INTO v_minute_count
    FROM public.ratings
   WHERE reviewer_id = NEW.reviewer_id
     AND created_at >= now() - interval '1 minute';

  IF v_minute_count >= 1 THEN
    RAISE EXCEPTION
      '잠시 후 다시 시도해 주세요. 같은 닉네임은 1분에 1회만 평가할 수 있어요.'
      USING ERRCODE = '54000',
            HINT    = 'rate_limit_minute';
  END IF;

  -- 1시간 윈도우
  SELECT count(*)
    INTO v_hour_count
    FROM public.ratings
   WHERE reviewer_id = NEW.reviewer_id
     AND created_at >= now() - interval '1 hour';

  IF v_hour_count >= 10 THEN
    RAISE EXCEPTION
      '같은 닉네임은 1시간에 10회까지만 평가할 수 있어요. 잠시 후 다시 시도해 주세요.'
      USING ERRCODE = '54000',
            HINT    = 'rate_limit_hour';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ratings_rate_limit() IS
  'ratings INSERT 시 reviewer_id별 1분 1회·1시간 10회 초과를 차단하는 '
  '소프트 rate-limit 트리거. ERRCODE 54000으로 시그널, HINT에 윈도우 구분.';

-- 멱등 재생성
DROP TRIGGER IF EXISTS trg_ratings_rate_limit ON public.ratings;
CREATE TRIGGER trg_ratings_rate_limit
  BEFORE INSERT ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.ratings_rate_limit();

COMMIT;

-- ============================================================================
-- 적용 후 자가 점검 (ROLES.md §2 dba 필수). 동일 세션에서 모두 통과 확인 전엔
-- 성공 보고 금지. 본 SQL은 마이그레이션 트랜잭션 밖이며, 사용자가 수동 실행.
-- ----------------------------------------------------------------------------
-- 1) schema_migrations 등록
--    SELECT version FROM supabase_migrations.schema_migrations
--     WHERE version = '20260515000001';
--    expect: 1행
--
-- 2) UNIQUE 제약 제거 확인
--    SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.ratings'::regclass
--       AND conname = 'ratings_restaurant_reviewer_unique';
--    expect: 0행
--
-- 3) 보조 인덱스 생성 확인
--    SELECT indexname FROM pg_indexes
--     WHERE schemaname = 'public'
--       AND tablename  = 'ratings'
--       AND indexname  = 'idx_ratings_restaurant_reviewer';
--    expect: 1행
--
-- 4) 뷰 정의 갱신 확인 (latest_per_reviewer CTE가 정의에 포함되어야 함)
--    SELECT pg_get_viewdef('public.restaurant_stats'::regclass, true)
--             LIKE '%latest_per_reviewer%';
--    expect: t
--
-- 5) 함수 등록 확인
--    SELECT proname, prosecdef FROM pg_proc
--     WHERE proname = 'ratings_rate_limit'
--       AND pronamespace = 'public'::regnamespace;
--    expect: 1행, prosecdef = f  -- SECURITY INVOKER
--
-- 6) 트리거 등록 확인
--    SELECT tgname, tgtype FROM pg_trigger
--     WHERE tgrelid = 'public.ratings'::regclass
--       AND tgname  = 'trg_ratings_rate_limit'
--       AND NOT tgisinternal;
--    expect: 1행
--
-- 7) 동작 1회 호출 — 같은 reviewer에 1분 내 2회 INSERT 시 두 번째가 RAISE
--    -- 첫 번째 INSERT는 통과해야 함. (테스트 후 DELETE로 원복)
--    WITH r AS (SELECT id FROM public.restaurants LIMIT 1),
--         v AS (SELECT id FROM public.reviewers   LIMIT 1)
--    INSERT INTO public.ratings (restaurant_id, reviewer_id, score)
--    SELECT r.id, v.id, 4.5 FROM r, v;
--
--    -- 두 번째 즉시 INSERT는 ERRCODE 54000 ('rate_limit_minute')으로 실패해야 함.
--    WITH r AS (SELECT id FROM public.restaurants LIMIT 1),
--         v AS (SELECT id FROM public.reviewers   LIMIT 1)
--    INSERT INTO public.ratings (restaurant_id, reviewer_id, score)
--    SELECT r.id, v.id, 5.0 FROM r, v;
--
--    -- 테스트 데이터 원복:
--    DELETE FROM public.ratings
--     WHERE created_at >= now() - interval '5 minute'
--       AND score IN (4.5, 5.0);
--    -- (필요 시 reviewer/식당 식별자로 더 엄밀히 좁힐 것)
--
-- 8) 뷰 응답 shape 확인 — dev/qa-2 호환성
--    SELECT id, name, rating_count, avg_score FROM public.restaurant_stats LIMIT 3;
-- ============================================================================
-- End of 20260515000001_ratings_dedup_softcap.sql
-- ============================================================================
