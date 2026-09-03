-- ============================================================================
-- 비즈밥 (where-yangjae) — 통합 스키마 DDL
--
-- 2026-09-03: supabase/migrations/ 15개 파일의 최종 상태를 단일 DDL로 통합.
-- 마이그레이션 이력 관리를 종료하고 이 파일이 스키마의 단일 출처(SSOT)가 된다.
--   * 모든 구문은 멱등(IF NOT EXISTS / OR REPLACE / DROP IF EXISTS) —
--     전체 재실행해도 데이터 유실 없음 (시드 제외 데이터 미포함).
--   * 스키마 변경 절차: 이 파일을 수정 → 변경 구문만 Supabase SQL Editor에서
--     수동 실행 → doc/db/table-spec.html 테이블정의서 동기화.
--   * 테이블정의서: doc/db/table-spec.html
--
-- 대상 환경: Supabase (PostgreSQL 15+), anon 키 + RLS (정식 Auth 없음)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extension
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. 공용 함수
-- ============================================================================

-- updated_at 자동 갱신 (BEFORE UPDATE 트리거용)
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

-- ============================================================================
-- 2. 테이블
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 reviewers — 평가자(닉네임)
--     nickname UNIQUE 제약은 제거됨(닉네임 자유 입력·중복 허용, 2026-05-15).
--     식별의 단일 출처는 id(uuid) — 클라이언트가 x-reviewer-id 헤더로 전달.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviewers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reviewers IS
  '평가자 닉네임 마스터. 사내 익명 평가의 1차 키 소스. 닉네임 중복 허용(표시용 텍스트).';

-- ----------------------------------------------------------------------------
-- 2.2 restaurants — 식당 마스터
--     soft delete(status) 기반. direction 컬럼은 제거됨(2026-05-15).
--     region = 동 이름(카카오 역지오코딩, 2026-09-03 2차 전환).
--     null이면 표시 계층이 regions 최근접 파생으로 폴백.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  category        text        NOT NULL
    CHECK (category IN ('한식','일식','중식','분식','패스트푸드','아시안','카페','기타')),
  menu            text,
  sheet_type      text        NOT NULL
    CHECK (sheet_type IN ('lunch','dinner')),
  region          text,
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

-- 지역 저장 전환 (2026-09-03 2차): CHECK ('양재','남부터미널')·DEFAULT·NOT NULL
-- 제거 — region은 이제 역지오코딩된 동 이름 자유 텍스트. 기존 적용 DB에도 멱등 실행.
-- ※ 과거 enum 값('양재' 등)의 일괄 NULL 정리는 1회성 데이터 작업이라 이 파일에
--    넣지 않는다 (재실행 시 역지오코딩 값까지 지워짐): UPDATE restaurants SET region = NULL;
ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_region_check;
ALTER TABLE public.restaurants ALTER COLUMN region DROP DEFAULT;
ALTER TABLE public.restaurants ALTER COLUMN region DROP NOT NULL;

COMMENT ON TABLE public.restaurants IS
  '식당 마스터. soft delete (status) 기반, 좌표/카카오 ID 옵션.';
COMMENT ON COLUMN public.restaurants.region IS
  '동 이름 — 등록/수정 시 클라이언트가 카카오 역지오코딩(coord2RegionCode 법정동)으로 채움. null=미지정(표시 계층이 regions 최근접 파생으로 폴백).';
COMMENT ON COLUMN public.restaurants.sheet_type IS
  '원본 시트 구분 — lunch=점심, dinner=저녁(회식).';
COMMENT ON COLUMN public.restaurants.status IS
  '운영 상태. 휴업/폐업도 레코드 보존 (soft delete).';

-- ----------------------------------------------------------------------------
-- 2.3 ratings — 평가 (별점 + 한줄평)
--     UNIQUE(restaurant_id, reviewer_id) 제약은 제거됨(1인 N평가 허용, 2026-05-15).
--     평균 왜곡은 restaurant_stats 뷰가 최신 1건만 반영하는 것으로 방지.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ratings (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid          NOT NULL
    REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reviewer_id    uuid          NOT NULL
    REFERENCES public.reviewers(id)   ON DELETE CASCADE,
  score          numeric(2,1)  NOT NULL
    CHECK (score >= 0.0 AND score <= 5.0 AND mod(score, 0.5) = 0),
  comment        text          CHECK (comment IS NULL OR char_length(comment) <= 200),
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ratings IS
  '평가(별점 0.0~5.0 0.5단위 + 한줄평 200자). 1인 N평가 허용 — 평균은 뷰에서 최신 1건만.';

-- ----------------------------------------------------------------------------
-- 2.4 rating_photos — 한줄평 사진 (평가당 0~3장)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rating_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id    uuid        NOT NULL
    REFERENCES public.ratings(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  sort_order   smallint    NOT NULL DEFAULT 0
    CHECK (sort_order BETWEEN 0 AND 2),
  byte_size    integer     CHECK (byte_size IS NULL OR byte_size <= 307200),
  width        smallint    CHECK (width  IS NULL OR width  > 0),
  height       smallint    CHECK (height IS NULL OR height > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rating_photos_rating_order_unique UNIQUE (rating_id, sort_order)
);

COMMENT ON TABLE public.rating_photos IS
  '한줄평 사진 0~3장. ratings 삭제 시 CASCADE + 트리거로 Storage 객체 동반 삭제.';
COMMENT ON COLUMN public.rating_photos.storage_path IS
  'rating-photos 버킷 내 객체 경로. ''<rating_id>/<nanoid>.jpg'' 권장.';

-- ----------------------------------------------------------------------------
-- 2.5 regions — 서비스 지역 기준점 (2026-09-03 파생 구조 전환)
--     식당의 지역은 저장하지 않고 "최근접 기준점"으로 파생.
--     새 지역 추가 = INSERT 한 줄 (토글·룰렛·지도 중심 자동 반영, 코드 수정 없음).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regions (
  name       text PRIMARY KEY,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.regions IS
  '서비스 지역 기준점. 식당의 지역은 최근접 기준점으로 파생. 지역 추가 = INSERT 한 줄.';

-- 기준점 시드 — 대표 지하철역 좌표
INSERT INTO public.regions (name, lat, lng, sort_order) VALUES
  ('양재',       37.4842, 127.0344, 1),
  ('남부터미널', 37.4765, 127.0048, 2)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. 인덱스
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_restaurants_category           ON public.restaurants (category);
CREATE INDEX IF NOT EXISTS idx_restaurants_sheet_type         ON public.restaurants (sheet_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_status             ON public.restaurants (status);
CREATE INDEX IF NOT EXISTS idx_ratings_reviewer_id            ON public.ratings (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_reviewer    ON public.ratings (restaurant_id, reviewer_id);
CREATE INDEX IF NOT EXISTS idx_rating_photos_rating_id        ON public.rating_photos (rating_id);

-- ============================================================================
-- 4. 트리거
-- ============================================================================

-- 4.1 updated_at 자동 갱신
DROP TRIGGER IF EXISTS trg_restaurants_set_updated_at ON public.restaurants;
CREATE TRIGGER trg_restaurants_set_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ratings_set_updated_at ON public.ratings;
CREATE TRIGGER trg_ratings_set_updated_at
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.2 평가 soft rate-limit — reviewer_id별 1분 1회 / 1시간 10회
--     초과 시 ERRCODE 54000 (클라이언트가 사용자 메시지로 그대로 표시).
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
  SELECT count(*) INTO v_minute_count
    FROM public.ratings
   WHERE reviewer_id = NEW.reviewer_id
     AND created_at >= now() - interval '1 minute';

  IF v_minute_count >= 1 THEN
    RAISE EXCEPTION
      '잠시 후 다시 시도해 주세요. 같은 닉네임은 1분에 1회만 평가할 수 있어요.'
      USING ERRCODE = '54000', HINT = 'rate_limit_minute';
  END IF;

  SELECT count(*) INTO v_hour_count
    FROM public.ratings
   WHERE reviewer_id = NEW.reviewer_id
     AND created_at >= now() - interval '1 hour';

  IF v_hour_count >= 10 THEN
    RAISE EXCEPTION
      '같은 닉네임은 1시간에 10회까지만 평가할 수 있어요. 잠시 후 다시 시도해 주세요.'
      USING ERRCODE = '54000', HINT = 'rate_limit_hour';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ratings_rate_limit() IS
  'ratings INSERT 시 reviewer_id별 1분 1회·1시간 10회 초과 차단. ERRCODE 54000, HINT에 윈도우 구분.';

DROP TRIGGER IF EXISTS trg_ratings_rate_limit ON public.ratings;
CREATE TRIGGER trg_ratings_rate_limit
  BEFORE INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.ratings_rate_limit();

-- 4.3 사진 삭제 시 Storage 객체 동반 정리 (SECURITY DEFINER — storage RLS 우회.
--     범위는 rating-photos 버킷 + OLD.storage_path 정확 일치로만 제한.)
CREATE OR REPLACE FUNCTION public.cleanup_rating_photo_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'rating-photos'
     AND name      = OLD.storage_path;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rating_photo_object() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rating_photos_after_delete ON public.rating_photos;
CREATE TRIGGER trg_rating_photos_after_delete
  AFTER DELETE ON public.rating_photos
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_rating_photo_object();

-- ============================================================================
-- 5. 뷰 — restaurant_stats
--    1인 N평가 환경에서 reviewer_id별 "최신 1건"만 평균에 반영(도배 왜곡 방지).
--    rating_count = 평가한 고유 사용자 수.
-- ============================================================================
DROP VIEW IF EXISTS public.restaurant_stats;

CREATE VIEW public.restaurant_stats AS
WITH latest_per_reviewer AS (
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
  COUNT(l.reviewer_id)             AS rating_count,
  ROUND(AVG(l.score)::numeric, 1)  AS avg_score
FROM public.restaurants r
LEFT JOIN latest_per_reviewer l ON l.restaurant_id = r.id
GROUP BY r.id, r.name;

COMMENT ON VIEW public.restaurant_stats IS
  '식당별 평가 수와 평균 별점(소수 1자리). reviewer_id별 최신 1건만 평균 반영. '
  'rating_count는 평가한 고유 사용자 수.';

GRANT SELECT ON public.restaurant_stats TO anon, authenticated;

-- ============================================================================
-- 6. RPC — pick_random_restaurant (룰렛)
--    p_region은 regions 기준점 최근접 파생으로 비교 (2026-09-03).
--    좌표 없는 식당은 지역 필터 시 제외. 거리 공식: degree² + 경도 cos 보정.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pick_random_restaurant(
  p_sheet_type text DEFAULT NULL,         -- 'lunch' | 'dinner' | NULL(둘 다)
  p_categories text[] DEFAULT NULL,       -- NULL이면 카테고리 무관
  p_include_closed boolean DEFAULT false, -- false면 휴업·폐업 제외
  p_region text DEFAULT NULL              -- regions.name | NULL(전체)
)
RETURNS SETOF public.restaurants
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.*
  FROM public.restaurants r
  WHERE (p_sheet_type IS NULL OR r.sheet_type = p_sheet_type)
    AND (p_categories IS NULL OR r.category = ANY(p_categories))
    AND (p_include_closed OR r.status = '운영중')
    AND (
      p_region IS NULL
      OR (
        r.lat IS NOT NULL AND r.lng IS NOT NULL
        AND p_region = (
          SELECT g.name
          FROM public.regions g
          ORDER BY power(r.lat - g.lat, 2)
                 + power((r.lng - g.lng) * cos(radians(37.48)), 2)
          LIMIT 1
        )
      )
    )
  ORDER BY random()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pick_random_restaurant(text, text[], boolean, text) IS
  '룰렛용 랜덤 단건 추천. p_region은 regions 기준점 최근접 파생으로 비교. 0건이면 빈 결과.';

GRANT EXECUTE ON FUNCTION public.pick_random_restaurant(text, text[], boolean, text)
  TO anon, authenticated;

-- ============================================================================
-- 7. RLS (Row Level Security)
--    익명(anon) 키만 노출되는 사내 비공개 서비스. "본인" = x-reviewer-id 헤더가
--    reviewer_id/reviewers.id와 일치하는 소프트 게이트 (어뷰징 1차 방지용).
-- ============================================================================
ALTER TABLE public.reviewers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions       ENABLE ROW LEVEL SECURITY;

-- 7.1 restaurants — SELECT/INSERT/UPDATE 모두, DELETE 차단
DROP POLICY IF EXISTS restaurants_select_all   ON public.restaurants;
DROP POLICY IF EXISTS restaurants_insert_all   ON public.restaurants;
DROP POLICY IF EXISTS restaurants_update_all   ON public.restaurants;
DROP POLICY IF EXISTS restaurants_delete_block ON public.restaurants;

CREATE POLICY restaurants_select_all ON public.restaurants
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY restaurants_insert_all ON public.restaurants
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY restaurants_update_all ON public.restaurants
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY restaurants_delete_block ON public.restaurants
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 7.2 reviewers — SELECT/INSERT 모두, UPDATE 본인만, DELETE 차단
DROP POLICY IF EXISTS reviewers_select_all   ON public.reviewers;
DROP POLICY IF EXISTS reviewers_insert_all   ON public.reviewers;
DROP POLICY IF EXISTS reviewers_update_own   ON public.reviewers;
DROP POLICY IF EXISTS reviewers_update_block ON public.reviewers;
DROP POLICY IF EXISTS reviewers_delete_block ON public.reviewers;

CREATE POLICY reviewers_select_all ON public.reviewers
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY reviewers_insert_all ON public.reviewers
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY reviewers_update_own ON public.reviewers
  FOR UPDATE TO anon, authenticated
  USING (id::text = current_setting('request.headers', true)::json->>'x-reviewer-id')
  WITH CHECK (id::text = current_setting('request.headers', true)::json->>'x-reviewer-id');
CREATE POLICY reviewers_delete_block ON public.reviewers
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 7.3 ratings — SELECT/INSERT 모두, UPDATE/DELETE 본인만
DROP POLICY IF EXISTS ratings_select_all ON public.ratings;
DROP POLICY IF EXISTS ratings_insert_all ON public.ratings;
DROP POLICY IF EXISTS ratings_update_own ON public.ratings;
DROP POLICY IF EXISTS ratings_delete_own ON public.ratings;

CREATE POLICY ratings_select_all ON public.ratings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ratings_insert_all ON public.ratings
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ratings_update_own ON public.ratings
  FOR UPDATE TO anon, authenticated
  USING (reviewer_id::text = current_setting('request.headers', true)::json->>'x-reviewer-id')
  WITH CHECK (reviewer_id::text = current_setting('request.headers', true)::json->>'x-reviewer-id');
CREATE POLICY ratings_delete_own ON public.ratings
  FOR DELETE TO anon, authenticated
  USING (reviewer_id::text = current_setting('request.headers', true)::json->>'x-reviewer-id');

-- 7.4 rating_photos — SELECT 모두, INSERT/DELETE 본인 평가만, UPDATE 차단
DROP POLICY IF EXISTS rating_photos_select_all   ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_insert_own   ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_update_block ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_delete_own   ON public.rating_photos;

CREATE POLICY rating_photos_select_all ON public.rating_photos
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rating_photos_insert_own ON public.rating_photos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ratings r
       WHERE r.id = rating_photos.rating_id
         AND r.reviewer_id::text
             = current_setting('request.headers', true)::json->>'x-reviewer-id'
    )
  );
CREATE POLICY rating_photos_update_block ON public.rating_photos
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY rating_photos_delete_own ON public.rating_photos
  FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ratings r
       WHERE r.id = rating_photos.rating_id
         AND r.reviewer_id::text
             = current_setting('request.headers', true)::json->>'x-reviewer-id'
    )
  );

-- 7.5 regions — 읽기만 공개. 쓰기 정책 없음(지역 추가는 관리자 SQL).
DROP POLICY IF EXISTS regions_select_all ON public.regions;

CREATE POLICY regions_select_all ON public.regions
  FOR SELECT TO anon, authenticated USING (true);

-- ============================================================================
-- 8. Storage — rating-photos 버킷 (public read, 300KB, JPEG/WebP)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rating-photos', 'rating-photos', true, 307200, ARRAY['image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects RLS — SELECT 모두 / INSERT는 '<uuid>/<file>' 경로 강제 /
-- DELETE 본인 / UPDATE 차단
DROP POLICY IF EXISTS rating_photos_select_all         ON storage.objects;
DROP POLICY IF EXISTS rating_photos_insert_uuid_prefix ON storage.objects;
DROP POLICY IF EXISTS rating_photos_update_block       ON storage.objects;
DROP POLICY IF EXISTS rating_photos_delete_own         ON storage.objects;

CREATE POLICY rating_photos_select_all ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'rating-photos');
CREATE POLICY rating_photos_insert_uuid_prefix ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'rating-photos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  );
CREATE POLICY rating_photos_delete_own ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'rating-photos'
    AND EXISTS (
      SELECT 1
        FROM public.rating_photos p
        JOIN public.ratings       r ON r.id = p.rating_id
       WHERE p.storage_path = storage.objects.name
         AND r.reviewer_id::text
             = current_setting('request.headers', true)::json->>'x-reviewer-id'
    )
  );
CREATE POLICY rating_photos_update_block ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- ============================================================================
-- End of schema.sql
-- ============================================================================
