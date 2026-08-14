-- ============================================================================
-- 20260514120001_init.sql
-- 원격 supabase_migrations.schema_migrations 이력에서 복원 (2026-08-12).
-- 리포 생성 이전에 적용된 초기 마이그레이션 — 로컬/원격 이력 정렬용.
-- 이미 원격에 적용되어 있으므로 db push 시 재실행되지 않는다.
-- ============================================================================

-- ============================================================================
-- Migration : 20260514_001_init.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : 초기 스키마 — reviewers / restaurants / ratings 테이블,
--             인덱스, updated_at 트리거, restaurant_stats 뷰 생성.
-- Notes     :
--   * PostgreSQL 15+ (Supabase) 환경 가정. 순수 SQL.
--   * Supabase 기본 제공 pgcrypto의 gen_random_uuid() 사용.
--   * 모든 객체에 IF NOT EXISTS / OR REPLACE 적용 — 재실행 안전.
--   * RLS 정책은 본 마이그레이션에 포함하지 않는다 (→ 20260514_002_rls.sql).
-- 기획서 단일 출처: doc/plan/yangjai_plan.html §6 (데이터베이스 스키마)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extension
-- ---------------------------------------------------------------------------
-- Supabase는 기본적으로 pgcrypto가 활성화되어 있으나, 셀프호스트 환경에서도
-- 동작하도록 명시적으로 보장한다.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. 공용 트리거 함수 — updated_at 자동 갱신
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'BEFORE UPDATE 트리거에서 updated_at 컬럼을 현재 시각으로 갱신';

-- ---------------------------------------------------------------------------
-- 2. reviewers — 평가자(닉네임) 테이블
--    기획서 §6.3
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviewers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.reviewers           IS '평가자 닉네임 마스터. 사내 익명 평가의 1차 키 소스.';

COMMENT ON COLUMN public.reviewers.nickname  IS '닉네임. UNIQUE NOT NULL. 기존 9명(케빈, 엠팍, 시니, 젱젱, 재재, 닭닭이, 백백, JJJJ, 리리) 시드 대상.';

-- ---------------------------------------------------------------------------
-- 3. restaurants — 식당 테이블
--    기획서 §6.2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,

  -- category : 기획서 §6.2 enum + §7.2 마이그레이션 매핑의 '아시안'까지 포함
  -- (§6.2 본문에 명시된 7종 외에 §7.2 매핑 규칙에 '아시안'이 등장하므로
  --  마이그레이션 안정성을 위해 합집합으로 허용. §6.2의 '카페'도 유지.)
  category        text        NOT NULL
    CHECK (category IN ('한식','일식','중식','분식','패스트푸드','아시안','카페','기타')),

  menu            text,

  direction       text
    CHECK (direction IS NULL OR direction IN ('북서','남동','북동','남서','중앙')),

  sheet_type      text        NOT NULL
    CHECK (sheet_type IN ('lunch','dinner')),

  naver_url       text,
  note            text,

  status          text        NOT NULL DEFAULT '운영중'
    CHECK (status IN ('운영중','휴업','폐업')),

  lat             float8,
  lng             float8,
  kakao_place_id  text,

  registered_by   uuid
    REFERENCES public.reviewers(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.restaurants                IS '식당 마스터. soft delete (status) 기반, 좌표/카카오 ID 옵션.';

COMMENT ON COLUMN public.restaurants.category       IS '카테고리 (한식·일식·중식·분식·패스트푸드·아시안·카페·기타).';

COMMENT ON COLUMN public.restaurants.direction      IS '양재역 기준 방향 (북서·남동·북동·남서·중앙). NULL 허용.';

COMMENT ON COLUMN public.restaurants.sheet_type     IS '원본 시트 구분 — lunch=점심, dinner=저녁(회식).';

COMMENT ON COLUMN public.restaurants.status         IS '운영 상태. 휴업/폐업도 레코드 보존 (soft delete).';

COMMENT ON COLUMN public.restaurants.registered_by  IS '등록자(닉네임) FK. 마이그레이션 데이터는 NULL. 닉네임 삭제 시 NULL로 보존.';

-- ---------------------------------------------------------------------------
-- 4. ratings — 평가 테이블
--    기획서 §6.4
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ratings (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  restaurant_id  uuid          NOT NULL
    REFERENCES public.restaurants(id) ON DELETE CASCADE,

  reviewer_id    uuid          NOT NULL
    REFERENCES public.reviewers(id)   ON DELETE CASCADE,

  -- 0.0 ~ 5.0, 0.5 단위. 0.5 step 강제는 mod() = 0 으로 표현.
  score          numeric(2,1)  NOT NULL
    CHECK (score >= 0.0 AND score <= 5.0 AND mod(score, 0.5) = 0),

  -- 한줄평 — 200자 이하 (기획서 §6.4, §10.3)
  comment        text          CHECK (comment IS NULL OR char_length(comment) <= 200),

  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),

  -- 1인 1평가 강제 (기획서 §6.4)
  CONSTRAINT ratings_restaurant_reviewer_unique
    UNIQUE (restaurant_id, reviewer_id)
);

COMMENT ON TABLE  public.ratings          IS '평가(별점+한줄평). 1인 1식당 1평가 강제.';

COMMENT ON COLUMN public.ratings.score    IS '별점 0.0~5.0, 0.5 단위.';

COMMENT ON COLUMN public.ratings.comment  IS '한줄평. 최대 200자.';

-- ---------------------------------------------------------------------------
-- 5. 인덱스 (기획서 §6.2)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_restaurants_category
  ON public.restaurants (category);

CREATE INDEX IF NOT EXISTS idx_restaurants_sheet_type
  ON public.restaurants (sheet_type);

CREATE INDEX IF NOT EXISTS idx_restaurants_status
  ON public.restaurants (status);

-- 평가 조회 시 식당별 join 가속용 보조 인덱스 (FK 보강).
-- UNIQUE(restaurant_id, reviewer_id) 인덱스가 (restaurant_id, …) 접근에는
-- 이미 동작하나, reviewer_id 단독 조회를 위해 별도 인덱스 추가.
CREATE INDEX IF NOT EXISTS idx_ratings_reviewer_id
  ON public.ratings (reviewer_id);

-- ---------------------------------------------------------------------------
-- 6. updated_at 자동 갱신 트리거
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_restaurants_set_updated_at ON public.restaurants;

CREATE TRIGGER trg_restaurants_set_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ratings_set_updated_at ON public.ratings;

CREATE TRIGGER trg_ratings_set_updated_at
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. 뷰 — restaurant_stats (기획서 §6.5)
--    식당별 평균 별점·평가 수 집계. 운영 상태 무관 (전체 평가 기준).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.restaurant_stats AS
SELECT
  r.id,
  r.name,
  COUNT(rt.id)                          AS rating_count,
  ROUND(AVG(rt.score)::numeric, 1)      AS avg_score
FROM public.restaurants r
LEFT JOIN public.ratings rt ON rt.restaurant_id = r.id
GROUP BY r.id, r.name;

COMMENT ON VIEW public.restaurant_stats IS
  '식당별 평가 수와 평균 별점 (소수 1자리 반올림). 평가 없으면 rating_count=0, avg_score=NULL.';

-- ============================================================================
-- End of 20260514_001_init.sql
-- 다음 마이그레이션 예정: 20260514_002_rls.sql (RLS 정책)
-- ============================================================================;
