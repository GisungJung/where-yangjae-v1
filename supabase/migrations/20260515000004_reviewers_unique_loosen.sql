-- ============================================================================
-- Migration : 20260515000004_reviewers_unique_loosen.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : 닉네임 자유 입력/수정 정책으로 전환.
--
--   사용자 결정 — 현재 'reviewers.nickname UNIQUE NOT NULL' 가드가 신규 닉네임
--   등록 흐름에서 "닉네임을 등록할 수 없어요" 에러를 자주 일으킴. 닉네임 중복을
--   허용하고, 본인 닉네임 수정도 허용하도록 다음 두 변경을 한 트랜잭션으로
--   적용한다:
--
--     (1) reviewers.nickname UNIQUE 제약 제거
--         (컬럼은 그대로 NOT NULL 유지 — 빈 닉네임은 의미 없음)
--     (2) RLS reviewers_update_block 제거 → reviewers_update_own 신설
--         (본인 row 만 UPDATE 가능 — ratings_update_own 패턴 재사용)
--
-- 영향 모델 — reviewer_id(uuid) 모델은 그대로 유지:
--   - ratings.reviewer_id, restaurants.registered_by 의 FK 그대로
--   - x-reviewer-id 헤더 매칭 RLS(ratings/rating_photos/storage.objects) 영향 없음
--   - 닉네임은 표시 텍스트일 뿐 — 같은 reviewer_id에 닉네임 UPDATE 시 그 사람의
--     모든 평가 표시 이름이 일괄 갱신 (FK는 reviewer_id 그대로이므로 자연).
--
-- 보고 의무 §2 — RLS 완화 항목 트리거. 사용자 명시 지시(task #18)로 면제 해석.
-- 적용 후 자가 점검은 본 파일 끝 주석 블록 참조 (ROLES.md §2).
-- 원격 직접 적용 금지 — 사용자가 supabase migration up 으로 적용.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. UNIQUE 제약 제거 — 동적 검색 (이름이 reviewers_nickname_key 외일 수 있음)
-- ---------------------------------------------------------------------------
-- PostgreSQL이 컬럼 레벨 UNIQUE에 부여하는 기본 이름은 '<table>_<column>_key'이지만,
-- Supabase CLI/마이그레이션 도구가 다른 이름으로 만들었을 가능성도 안전 처리.
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.reviewers'::regclass
       AND contype  = 'u'
       AND conkey   = ARRAY[(
         SELECT attnum
           FROM pg_attribute
          WHERE attrelid = 'public.reviewers'::regclass
            AND attname  = 'nickname'
            AND NOT attisdropped
       )]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.reviewers DROP CONSTRAINT %I',
      v_conname
    );
    RAISE NOTICE 'Dropped UNIQUE constraint % on reviewers.nickname', v_conname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. RLS — update_block 제거, update_own 신설
--    "본인" = x-reviewer-id 헤더가 reviewers.id 와 일치 (uuid 기반)
--    ratings_update_own (120008) 과 같은 패턴.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reviewers_update_block ON public.reviewers;
DROP POLICY IF EXISTS reviewers_update_own   ON public.reviewers;

CREATE POLICY reviewers_update_own
  ON public.reviewers
  FOR UPDATE
  TO anon, authenticated
  USING (
    id::text
      = current_setting('request.headers', true)::json->>'x-reviewer-id'
  )
  WITH CHECK (
    id::text
      = current_setting('request.headers', true)::json->>'x-reviewer-id'
  );

-- reviewers_delete_block 은 그대로 유지 — 평가 이력 무결성을 위해 닉네임 row
-- 자체 삭제는 계속 차단. (지우려면 service_role.)

COMMIT;

-- ============================================================================
-- 적용 후 자가 점검 (ROLES.md §2 dba 필수). 동일 세션에서 모두 통과 전엔
-- "성공" 보고 금지.
-- ----------------------------------------------------------------------------
-- 1) schema_migrations 등록
--    SELECT version FROM supabase_migrations.schema_migrations
--     WHERE version = '20260515000004';
--    expect: 1행
--
-- 2) nickname UNIQUE 제약 부재
--    SELECT count(*) FROM pg_constraint
--     WHERE conrelid = 'public.reviewers'::regclass
--       AND contype  = 'u'
--       AND conkey   = ARRAY[(
--         SELECT attnum FROM pg_attribute
--          WHERE attrelid='public.reviewers'::regclass
--            AND attname='nickname' AND NOT attisdropped
--       )];
--    expect: 0
--    (UNIQUE 인덱스도 자동 정리됨 — pg_indexes에서 reviewers_nickname_key 0행)
--
-- 3) RLS 정책 교체 확인
--    SELECT policyname FROM pg_policies
--     WHERE schemaname='public' AND tablename='reviewers'
--     ORDER BY policyname;
--    expect: reviewers_delete_block / reviewers_insert_all
--          / reviewers_select_all  / reviewers_update_own
--
--    SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='reviewers'
--       AND policyname = 'reviewers_update_block';
--    expect: 0
--
-- 4) 동작 — 닉네임 중복 INSERT 가능
--    INSERT INTO public.reviewers (nickname) VALUES ('자가점검_더미');
--    INSERT INTO public.reviewers (nickname) VALUES ('자가점검_더미');
--    -- expect: 둘 다 성공 (다른 id, 같은 nickname)
--    DELETE FROM public.reviewers WHERE nickname = '자가점검_더미';
--
-- 5) (선택) 본인 row 닉네임 UPDATE 정책 동작 확인
--    -- service_role 또는 PostgREST에서 x-reviewer-id 헤더 주입 후
--    -- UPDATE public.reviewers SET nickname='새이름' WHERE id='<본인 uuid>';
--    -- expect: 본인이면 1행, 타인이면 0행 반환
-- ============================================================================
-- End of 20260515000004_reviewers_unique_loosen.sql
-- ============================================================================
