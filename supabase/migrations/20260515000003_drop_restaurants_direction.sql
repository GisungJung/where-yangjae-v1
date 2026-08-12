-- ============================================================================
-- Migration : 20260515000003_drop_restaurants_direction.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : restaurants.direction 컬럼 제거.
--
--   사용자 결정 — '방향(북서·남동·북동·남서·중앙)'은 비즈데이터 회사 위치를
--   기준으로 만든 사내 전용 메타 정보라 일반화가 불가능. 본 컬럼과 부속 CHECK
--   제약을 삭제하여 모델을 단순화한다.
--
--   DROP COLUMN 효과:
--     - 컬럼 데이터(시드/현행 값) 영구 삭제
--     - direction에 걸려 있던 CHECK 제약 자동 삭제
--     - 컬럼 의존 객체 없음(인덱스/뷰/함수 모두 direction을 참조하지 않음 — 검토 완료)
--
-- 기획서/문서 SSOT 갱신 필요 (담당 외 — dev 또는 사용자):
--   * doc/plan/yangjai_plan.html §6.2 restaurants 테이블 정의의 direction 행
--     및 enum 정의 삭제
--   * 같은 문서 내 다른 direction 언급 (있다면) 일괄 삭제
--   * README.md — direction 언급은 현재 없음(검색 결과 0건), 확인 후 무변경 가능
--   * src/types/database.ts 재생성, src/types/domain.ts DirectionSchema 제거
--   * UI: AddRestaurantPage / EditRestaurantPage 폼, RestaurantCard /
--     RestaurantDetailPage / RoulettePage 표시, RestaurantCard chip — 모두 dev
--
-- 적용 후 자가 점검은 본 파일 끝 주석 블록 참조 (ROLES.md §2).
-- 원격 직접 적용 금지 — 사용자가 supabase migration up 으로 적용.
-- ============================================================================

BEGIN;

ALTER TABLE public.restaurants
  DROP COLUMN IF EXISTS direction;

COMMIT;

-- ============================================================================
-- 적용 후 자가 점검 (ROLES.md §2 dba 필수). 동일 세션에서 모두 통과 전엔
-- "성공" 보고 금지.
-- ----------------------------------------------------------------------------
-- 1) schema_migrations 등록
--    SELECT version FROM supabase_migrations.schema_migrations
--     WHERE version = '20260515000003';
--    expect: 1행
--
-- 2) information_schema.columns 에서 direction 부재
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public'
--       AND table_name='restaurants'
--       AND column_name='direction';
--    expect: 0
--
-- 3) (보너스) direction CHECK 제약 자동 정리 확인
--    SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.restaurants'::regclass
--       AND pg_get_constraintdef(oid) ILIKE '%direction%';
--    expect: 0행
--
-- 4) (보너스) restaurant_stats 뷰가 여전히 정상 동작하는지 확인
--    (뷰는 id/name만 참조하므로 영향 없어야 함)
--    SELECT count(*) FROM public.restaurant_stats;
--    expect: 식당 수와 동일
-- ============================================================================
-- End of 20260515000003_drop_restaurants_direction.sql
-- ============================================================================
