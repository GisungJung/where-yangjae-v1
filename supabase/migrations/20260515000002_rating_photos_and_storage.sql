-- ============================================================================
-- Migration : 20260515000002_rating_photos_and_storage.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : 한줄평 사진 업로드(평가당 0~3장) — v1.1 신규 기능.
--             분석안(#6 1차+보강) 일괄 채택. 단일 트랜잭션으로 묶음.
--
--   객체:
--     1) public.rating_photos      — 사진 메타 테이블 (FK CASCADE ratings)
--        + idx_rating_photos_rating_id
--     2) public.rating_photos RLS  — 4정책 (select_all / insert_own / update_block / delete_own)
--        (※ task description엔 명시 없으나 Supabase는 public.* 테이블에 RLS
--           정책이 없으면 anon SELECT가 차단되므로 함께 정의 — dba 자율 보강)
--     3) storage.buckets           — 'rating-photos' public 버킷, 300KB, JPEG/WebP
--     4) storage.objects RLS       — 4정책 (select_all / insert_uuid_prefix / delete_own / update_block)
--     5) cleanup_rating_photo_object() — SECURITY DEFINER 청소 함수
--     6) trg_rating_photos_after_delete — AFTER DELETE 트리거
--
--   권한 모델:
--     - "본인" = 클라이언트가 보낸 헤더 'x-reviewer-id' 가 평가의 reviewer_id 와 일치
--       (기존 ratings_update_own / ratings_delete_own 패턴 재사용)
--     - 본 마이그레이션은 storage.objects에 SECURITY DEFINER로 우회 삭제 함수를
--       1개 추가한다 — ratings 삭제 → rating_photos CASCADE → AFTER DELETE 트리거
--       흐름으로 storage 객체까지 동반 정리. 우회 범위는 'rating-photos' 버킷 +
--       OLD.storage_path 정확 일치로만 제한되어 권한 escalation 위험 없음.
--
--   적용 후 자가 점검: 본 파일 끝 주석 블록 7단계.
--   원격 직접 적용 금지 — 사용자가 supabase migration up 으로 적용.
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. rating_photos 테이블
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.rating_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  rating_id    uuid        NOT NULL
    REFERENCES public.ratings(id) ON DELETE CASCADE,

  -- Storage 객체 경로. bucket 제외. 예: '<rating_id>/<nanoid>.jpg'
  storage_path text        NOT NULL,

  -- 0,1,2 (1~3장)
  sort_order   smallint    NOT NULL DEFAULT 0
    CHECK (sort_order BETWEEN 0 AND 2),

  -- 클라가 업로드 시 기록(없어도 됨). 300KB hard cap.
  byte_size    integer     CHECK (byte_size IS NULL OR byte_size <= 307200),

  -- 표시용(없어도 됨)
  width        smallint    CHECK (width  IS NULL OR width  > 0),
  height       smallint    CHECK (height IS NULL OR height > 0),

  created_at   timestamptz NOT NULL DEFAULT now(),

  -- 한 평가당 sort_order 중복 방지
  CONSTRAINT rating_photos_rating_order_unique
    UNIQUE (rating_id, sort_order)
);

COMMENT ON TABLE  public.rating_photos              IS '한줄평 사진 0~3장. ratings 삭제 시 CASCADE.';
COMMENT ON COLUMN public.rating_photos.storage_path IS 'rating-photos 버킷 내 객체 경로. ''<rating_id>/<nanoid>.jpg'' 권장.';
COMMENT ON COLUMN public.rating_photos.sort_order   IS '표시 순서. 0,1,2 — 한 평가당 최대 3장.';
COMMENT ON COLUMN public.rating_photos.byte_size    IS '업로드 시 클라가 기록. 300KB(307200B) 초과 금지.';

CREATE INDEX IF NOT EXISTS idx_rating_photos_rating_id
  ON public.rating_photos (rating_id);


-- ===========================================================================
-- 2. public.rating_photos RLS
--    Supabase는 public.* 테이블에 RLS 없으면 anon 접근 자체가 막힘.
--    ratings 정책(120008) 패턴 재사용 — x-reviewer-id 헤더 매칭.
-- ===========================================================================
ALTER TABLE public.rating_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rating_photos_select_all  ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_insert_own  ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_update_block ON public.rating_photos;
DROP POLICY IF EXISTS rating_photos_delete_own  ON public.rating_photos;

-- 누구나 조회
CREATE POLICY rating_photos_select_all
  ON public.rating_photos
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 본인 평가에만 사진 추가 가능
-- (rating_id에 해당하는 ratings.reviewer_id가 x-reviewer-id 헤더와 일치해야 함)
CREATE POLICY rating_photos_insert_own
  ON public.rating_photos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ratings r
       WHERE r.id = rating_photos.rating_id
         AND r.reviewer_id::text
             = current_setting('request.headers', true)::json->>'x-reviewer-id'
    )
  );

-- UPDATE는 차단 (객체 메타 변경 필요 없음 — 정렬 변경은 DELETE+INSERT)
CREATE POLICY rating_photos_update_block
  ON public.rating_photos
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 본인 평가의 사진만 삭제
CREATE POLICY rating_photos_delete_own
  ON public.rating_photos
  FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ratings r
       WHERE r.id = rating_photos.rating_id
         AND r.reviewer_id::text
             = current_setting('request.headers', true)::json->>'x-reviewer-id'
    )
  );


-- ===========================================================================
-- 3. Storage 버킷 — rating-photos
-- ===========================================================================
-- Supabase storage.buckets 스키마: id, name, public, file_size_limit, allowed_mime_types
-- 멱등: ON CONFLICT (id) DO UPDATE 로 옵션 갱신까지 보장.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rating-photos',
  'rating-photos',
  true,                                         -- public read OK
  307200,                                       -- 300 KB
  ARRAY['image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public              = EXCLUDED.public,
  file_size_limit     = EXCLUDED.file_size_limit,
  allowed_mime_types  = EXCLUDED.allowed_mime_types;


-- ===========================================================================
-- 4. storage.objects RLS — 4정책
--    SELECT 누구나 / INSERT는 UUID prefix 강제 / DELETE 본인 / UPDATE 차단
-- ===========================================================================
DROP POLICY IF EXISTS rating_photos_select_all          ON storage.objects;
DROP POLICY IF EXISTS rating_photos_insert_uuid_prefix  ON storage.objects;
DROP POLICY IF EXISTS rating_photos_update_block        ON storage.objects;
DROP POLICY IF EXISTS rating_photos_delete_own          ON storage.objects;

-- SELECT: public 버킷이므로 RLS 통과시켜야 URL 접근 시 200 응답
CREATE POLICY rating_photos_select_all
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'rating-photos');

-- INSERT: 누구나 가능하되 경로가 '<uuid>/<filename>' 형식이어야 함
-- 경로 임의 침투 차단 — 다른 사용자 평가 디렉토리에 끼워넣기 방지.
CREATE POLICY rating_photos_insert_uuid_prefix
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'rating-photos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  );

-- DELETE: 객체가 가리키는 rating_photos row의 ratings.reviewer_id 가
--         x-reviewer-id 헤더와 일치할 때만.
-- rating_photos.storage_path 와 storage.objects.name 의 매칭으로 단순화
-- (객체 이름 = 'rating_id/filename' 그대로 storage_path 에 저장하기로 약속).
CREATE POLICY rating_photos_delete_own
  ON storage.objects
  FOR DELETE
  TO anon, authenticated
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

-- UPDATE: 차단 (객체 메타 변경 필요 없음)
CREATE POLICY rating_photos_update_block
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- ===========================================================================
-- 5. cleanup_rating_photo_object() — SECURITY DEFINER 청소 함수
--    rating_photos row 삭제 시 storage 객체를 동반 삭제.
--    storage.objects RLS 를 우회해야 하므로 SECURITY DEFINER.
--    안전 범위: bucket='rating-photos' + name=OLD.storage_path 정확 일치만.
-- ===========================================================================
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

COMMENT ON FUNCTION public.cleanup_rating_photo_object() IS
  'rating_photos AFTER DELETE 시 동반 객체 삭제. SECURITY DEFINER로 '
  'storage.objects RLS 우회. 범위는 rating-photos 버킷 + storage_path 일치로 제한.';

-- 본 함수는 트리거 전용이므로 anon/authenticated EXECUTE 권한을 부여하지 않는다.
-- (기본 PUBLIC EXECUTE 가능성 제거)
REVOKE ALL ON FUNCTION public.cleanup_rating_photo_object() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rating_photos_after_delete ON public.rating_photos;
CREATE TRIGGER trg_rating_photos_after_delete
  AFTER DELETE ON public.rating_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_rating_photo_object();

COMMIT;

-- ============================================================================
-- 적용 후 자가 점검 (ROLES.md §2 dba 필수). 사용자가 마이그레이션 적용 후
-- 동일 세션에서 7개 모두 통과 확인 전엔 성공 보고 금지.
-- ----------------------------------------------------------------------------
-- 1) schema_migrations 등록
--    SELECT version FROM supabase_migrations.schema_migrations
--     WHERE version = '20260515000002';
--    expect: 1행
--
-- 2) public.rating_photos 테이블 + RLS 활성화
--    SELECT relrowsecurity FROM pg_class
--     WHERE oid = 'public.rating_photos'::regclass;          -- expect: t
--    SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='rating_photos';
--    -- expect: 4 (select_all / insert_own / update_block / delete_own)
--
-- 3) storage.buckets 1행 + 옵션
--    SELECT id, public, file_size_limit, allowed_mime_types
--      FROM storage.buckets WHERE id = 'rating-photos';
--    -- expect: public=t, file_size_limit=307200, allowed={image/jpeg,image/webp}
--
-- 4) storage.objects 정책 4개
--    SELECT policyname FROM pg_policies
--     WHERE schemaname='storage' AND tablename='objects'
--       AND policyname LIKE 'rating_photos%';
--    -- expect: 4건
--
-- 5) cleanup 함수 등록 + SECURITY DEFINER
--    SELECT proname, prosecdef FROM pg_proc
--     WHERE proname = 'cleanup_rating_photo_object'
--       AND pronamespace = 'public'::regnamespace;
--    -- expect: 1행, prosecdef = t
--
-- 6) AFTER DELETE 트리거
--    SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.rating_photos'::regclass
--       AND tgname  = 'trg_rating_photos_after_delete'
--       AND NOT tgisinternal;
--    -- expect: 1행
--
-- 7) 동작 1회 (INSERT → DELETE → 객체 동반 삭제 확인)
--    -- 7-1) 임시 row 1개 + 임시 storage 객체 1개를 같은 storage_path 로 생성
--    --      (헤더 x-reviewer-id 우회 불가능한 RLS 환경에선 service_role 또는
--    --       Supabase Studio SQL editor에서 실행 권장)
--    WITH r AS (SELECT id, reviewer_id FROM public.ratings LIMIT 1),
--         o AS (
--           INSERT INTO storage.objects (bucket_id, name, owner, metadata)
--           SELECT 'rating-photos', r.id::text||'/self_check.jpg', NULL, '{}'::jsonb
--             FROM r
--           RETURNING name
--         )
--    INSERT INTO public.rating_photos (rating_id, storage_path, sort_order, byte_size)
--    SELECT r.id, o.name, 0, 1234
--      FROM r, o
--    RETURNING id, storage_path;
--
--    -- 7-2) DELETE 시 트리거가 storage.objects 도 같이 삭제하는지 확인
--    DELETE FROM public.rating_photos
--     WHERE storage_path LIKE '%/self_check.jpg';
--    SELECT count(*) FROM storage.objects
--     WHERE bucket_id='rating-photos' AND name LIKE '%/self_check.jpg';
--    -- expect: 0
-- ============================================================================
-- End of 20260515000002_rating_photos_and_storage.sql
-- ============================================================================
