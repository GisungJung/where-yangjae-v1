-- ============================================================================
-- Migration : 20260514120008_rls_repair.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : 사고 복구 — 002(rls) 마이그레이션이 schema_migrations에는 등록
--             되었으나 실제 DB에 ENABLE ROW LEVEL SECURITY / CREATE POLICY가
--             반영되지 않은 상태 (pg_class.relrowsecurity = false, 정책 0건)
--             가 확인됨. 003(seed) 이후의 데이터 마이그레이션은 모두 정상.
--
-- 경위    : 직전 dba 인스턴스가 002를 작성·등록했으나 트랜잭션 일부가 누락된
--           것으로 추정. 본 파일은 002와 의미적으로 100% 동일한 정책 12개를
--           멱등 패턴(DROP IF EXISTS + CREATE)으로 재적용한다.
--           002 자체는 이력 보존을 위해 수정하지 않는다.
--
-- 승인    : team-lead 즉시 복구 승인 (보고 의무 §2 — RLS 정책 완화/누락).
--
-- 정책 12개 (102와 동일):
--   restaurants : select_all / insert_all / update_all / delete_block(RESTRICTIVE)
--   reviewers   : select_all / insert_all / update_block(RESTRICTIVE) / delete_block(RESTRICTIVE)
--   ratings     : select_all / insert_all / update_own / delete_own
--
-- 기획서 단일 출처: doc/plan/yangjai_plan.html §10 (보안 & RLS 정책)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS 활성화 (idempotent — 이미 켜져 있어도 no-op)
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
-- 5. 뷰 권한 — restaurant_stats (멱등 재확인)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.restaurant_stats TO anon, authenticated;

-- ============================================================================
-- End of 20260514120008_rls_repair.sql
-- ============================================================================
