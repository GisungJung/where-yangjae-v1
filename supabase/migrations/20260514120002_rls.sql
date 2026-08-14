-- ============================================================================
-- 20260514120002_rls.sql
-- 원격 supabase_migrations.schema_migrations 이력에서 복원 (2026-08-12).
-- 리포 생성 이전에 적용된 초기 마이그레이션 — 로컬/원격 이력 정렬용.
-- 이미 원격에 적용되어 있으므로 db push 시 재실행되지 않는다.
-- ============================================================================

-- ============================================================================
-- Migration : 20260514_002_rls.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : reviewers / restaurants / ratings 테이블에 RLS 활성화 및
--             기획서 §10.1 표대로 정책 부여.
-- Notes     :
--   * 익명(anon) 키만 노출되는 사내 비공개 서비스. 정식 Auth 없음.
--   * UPDATE/DELETE 권한은 클라이언트가 보내는 'x-reviewer-id' 헤더 기반
--     "소프트 게이트" — 강한 보안이 아닌 어뷰징 1차 방지용.
--   * 정책 이름 규칙: <table>_<action>_<scope>
--   * 모든 CREATE 전 DROP POLICY IF EXISTS — 재실행 안전.
--   * anon / authenticated 두 role 모두에 명시 적용 (TO anon, authenticated).
-- 기획서 단일 출처: doc/plan/yangjai_plan.html §10 (보안 & RLS 정책)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. RLS 활성화
-- ---------------------------------------------------------------------------
ALTER TABLE public.reviewers   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ratings     ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. restaurants 정책
--    기획서 §10.1: SELECT 모두 / INSERT 모두 / UPDATE 모두 / DELETE 차단
-- ===========================================================================

DROP POLICY IF EXISTS restaurants_select_all   ON public.restaurants;

DROP POLICY IF EXISTS restaurants_insert_all   ON public.restaurants;

DROP POLICY IF EXISTS restaurants_update_all   ON public.restaurants;

DROP POLICY IF EXISTS restaurants_delete_block ON public.restaurants;

CREATE POLICY restaurants_select_all
  ON public.restaurants
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY restaurants_insert_all
  ON public.restaurants
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 휴업/폐업 토글 등 누구나 status 갱신 가능 (어뷰징은 Rate Limit으로 대응)
CREATE POLICY restaurants_update_all
  ON public.restaurants
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE는 클라이언트에서 차단. (RESTRICTIVE + USING(false)로 명시 거부)
-- Supabase Studio (service_role) 는 RLS를 우회하므로 운영자 관리는 가능.
CREATE POLICY restaurants_delete_block
  ON public.restaurants
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ===========================================================================
-- 3. reviewers 정책
--    기획서 §10.1: SELECT 모두 / INSERT 모두 / UPDATE 차단 / DELETE 차단
-- ===========================================================================

DROP POLICY IF EXISTS reviewers_select_all   ON public.reviewers;

DROP POLICY IF EXISTS reviewers_insert_all   ON public.reviewers;

DROP POLICY IF EXISTS reviewers_update_block ON public.reviewers;

DROP POLICY IF EXISTS reviewers_delete_block ON public.reviewers;

CREATE POLICY reviewers_select_all
  ON public.reviewers
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY reviewers_insert_all
  ON public.reviewers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE / DELETE는 명시 차단 (RESTRICTIVE).
-- 닉네임은 한 번 만들면 변경/삭제 불가 — 데이터 무결성 + 감사 추적 유지.
CREATE POLICY reviewers_update_block
  ON public.reviewers
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY reviewers_delete_block
  ON public.reviewers
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ===========================================================================
-- 4. ratings 정책
--    기획서 §10.1: SELECT 모두 / INSERT 모두
--                 / UPDATE 본인만 / DELETE 본인만
--    "본인" = 클라이언트가 보낸 헤더 'x-reviewer-id' 가 row의 reviewer_id와 일치
-- ===========================================================================

DROP POLICY IF EXISTS ratings_select_all  ON public.ratings;

DROP POLICY IF EXISTS ratings_insert_all  ON public.ratings;

DROP POLICY IF EXISTS ratings_update_own  ON public.ratings;

DROP POLICY IF EXISTS ratings_delete_own  ON public.ratings;

CREATE POLICY ratings_select_all
  ON public.ratings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY ratings_insert_all
  ON public.ratings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 본인 닉네임 평가만 UPDATE 가능.
-- 기획서 §10.2 예시와 동일: request.headers의 'x-reviewer-id' 와 row 매칭.
-- USING : 어떤 row를 수정 대상으로 볼지
-- WITH CHECK : 수정 후 row가 가져야 할 조건 — reviewer_id 변경 자체도 방지.
CREATE POLICY ratings_update_own
  ON public.ratings
  FOR UPDATE
  TO anon, authenticated
  USING (
    reviewer_id::text
      = current_setting('request.headers', true)::json->>'x-reviewer-id'
  )
  WITH CHECK (
    reviewer_id::text
      = current_setting('request.headers', true)::json->>'x-reviewer-id'
  );

CREATE POLICY ratings_delete_own
  ON public.ratings
  FOR DELETE
  TO anon, authenticated
  USING (
    reviewer_id::text
      = current_setting('request.headers', true)::json->>'x-reviewer-id'
  );

-- ---------------------------------------------------------------------------
-- 5. 뷰 권한 — restaurant_stats
--    뷰는 RLS 대상이 아니지만 anon/authenticated 에 SELECT 권한 명시.
--    기본적으로 Supabase는 이 두 role에 PUBLIC 권한이 부여되어 있지만
--    셀프호스트/회수된 환경에서도 정상 동작하도록 명시한다.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.restaurant_stats TO anon, authenticated;

-- ============================================================================
-- End of 20260514_002_rls.sql
-- 다음 마이그레이션 예정: 20260514_003_seed.sql (시드 데이터)
-- ============================================================================;
