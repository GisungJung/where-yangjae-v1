-- ============================================================================
-- 20260514120003_seed.sql
-- 원격 supabase_migrations.schema_migrations 이력에서 복원 (2026-08-12).
-- 리포 생성 이전에 적용된 초기 마이그레이션 — 로컬/원격 이력 정렬용.
-- 이미 원격에 적용되어 있으므로 db push 시 재실행되지 않는다.
-- ============================================================================

-- ============================================================================
-- Migration : 20260514_003_seed.sql
-- Project   : '양재어디가' (where-yangjae)
-- Author    : dba (agent)
-- Purpose   : QA/개발용 시드 데이터.
--             - reviewers 9명 (기획서 명시 닉네임)
--             - restaurants 18개 (카테고리/sheet_type/status 다양성 확보)
--             - ratings 50건 내외 (식당당 0~5건, 일부 식당 0건 유지)
-- Notes     :
--   * 재실행 안전: 모든 INSERT에 ON CONFLICT DO NOTHING.
--   * 좌표는 양재역(37.4837, 127.0359) 기준 ±0.005도 내 결정론적 분포.
--   * QA가 UI 분기(빈 상태, 휴업·폐업, 평점 미존재)를 검증할 수 있도록 설계.
--   * Supabase Free Tier 친화 — 시드 총량 < 100 row.
--   * setseed() 로 random 고정 → 재실행 시 동일 결과.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. reviewers — 기획서 §6.3 명시 9명
-- ---------------------------------------------------------------------------
INSERT INTO public.reviewers (nickname) VALUES
  ('케빈'),
  ('엠팍'),
  ('시니'),
  ('젱젱'),
  ('재재'),
  ('닭닭이'),
  ('백백'),
  ('JJJJ'),
  ('리리')
ON CONFLICT (nickname) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. restaurants — 18개 (카테고리 8종 골고루 + 휴업/폐업 분기 확보)
--    이름이 UNIQUE 가 아니므로 중복 방지를 위해
--    "동일 (name, sheet_type) 시 SKIP" 트랜잭션 가드 적용.
--    가장 단순하게 "이미 동일 name 식당이 있으면 전체 SKIP" 방식 사용.
-- ---------------------------------------------------------------------------
DO $seed_restaurants$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE name IN (
      '양재골 김치찌개','양재 본가 갈비탕','순대국집 양재점','매운갈비찜 양재본점',
      '돈카츠 양재','우동 양재','스시 양재','짬뽕왕 양재',
      '북경반점 양재','김밥천국 양재','떡볶이 양재분식','버거킹 양재역점',
      'KFC 양재점','쌀국수 양재','타이 키친 양재','카페 양재로스터스',
      '브런치 카페 양재','회덮밥+알탕 양재'
    )
  ) THEN
    RAISE NOTICE '[seed] restaurants 이미 시드됨 — SKIP';
  ELSE
    -- 양재역 기준 좌표 (37.4837, 127.0359) 주변 결정론적 분포
    INSERT INTO public.restaurants
      (name,                       category,    menu,                       direction, sheet_type, naver_url,                          note,                       status,  lat,        lng,         kakao_place_id, registered_by)
    VALUES
      -- 한식 (lunch 위주)
      ('양재골 김치찌개',           '한식',      '김치찌개, 제육볶음',       '북서',    'lunch',    'https://map.naver.com/v5/?seed=1', '점심 정식 7,000원',        '운영중', 37.4855,  127.0345,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='케빈')),
      ('양재 본가 갈비탕',          '한식',      '갈비탕, 곰탕',             '중앙',    'lunch',    'https://map.naver.com/v5/?seed=2', '진한 국물',                '운영중', 37.4838,  127.0360,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='엠팍')),
      ('순대국집 양재점',           '한식',      '순대국, 머릿고기',         '남동',    'lunch',    'https://map.naver.com/v5/?seed=3', NULL,                       '운영중', 37.4820,  127.0380,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='시니')),
      ('매운갈비찜 양재본점',       '한식',      '매운갈비찜, 공기밥',       '북동',    'dinner',   'https://map.naver.com/v5/?seed=4', '회식 추천',                '운영중', 37.4860,  127.0370,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='젱젱')),

      -- 일식
      ('돈카츠 양재',               '일식',      '히레카츠, 로스카츠',       '남서',    'lunch',    'https://map.naver.com/v5/?seed=5', '바삭함',                   '운영중', 37.4815,  127.0340,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='재재')),
      ('우동 양재',                 '일식',      '카케우동, 텐동',           '북서',    'lunch',    'https://map.naver.com/v5/?seed=6', NULL,                       '휴업',   37.4850,  127.0335,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='닭닭이')),
      ('스시 양재',                 '일식',      '초밥 오마카세',            '중앙',    'dinner',   'https://map.naver.com/v5/?seed=7', '회식, 예약 필수',          '운영중', 37.4842,  127.0358,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='백백')),

      -- 중식
      ('짬뽕왕 양재',               '중식',      '짬뽕, 짜장',               '남동',    'lunch',    'https://map.naver.com/v5/?seed=8', '매운 짬뽕 유명',           '운영중', 37.4825,  127.0375,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='JJJJ')),
      ('북경반점 양재',             '중식',      '코스, 깐풍기',             '북동',    'dinner',   'https://map.naver.com/v5/?seed=9', '회식 코스 추천',           '폐업',   37.4858,  127.0372,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='리리')),

      -- 분식
      ('김밥천국 양재',             '분식',      '김밥, 라면, 떡볶이',       '북서',    'lunch',    'https://map.naver.com/v5/?seed=10', NULL,                       '운영중', 37.4853,  127.0348,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='케빈')),
      ('떡볶이 양재분식',           '분식',      '떡볶이, 순대, 튀김',       '남서',    'lunch',    'https://map.naver.com/v5/?seed=11', '저렴',                     '운영중', 37.4818,  127.0342,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='엠팍')),

      -- 패스트푸드
      ('버거킹 양재역점',           '패스트푸드','와퍼, 콜라',               '중앙',    'lunch',    'https://map.naver.com/v5/?seed=12', '역 1번 출구',              '운영중', 37.4840,  127.0362,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='시니')),
      ('KFC 양재점',                '패스트푸드','징거버거',                 '남동',    'lunch',    'https://map.naver.com/v5/?seed=13', NULL,                       '폐업',   37.4822,  127.0378,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='젱젱')),

      -- 아시안
      ('쌀국수 양재',               '아시안',    '베트남 쌀국수, 분짜',      '북동',    'lunch',    'https://map.naver.com/v5/?seed=14', '진한 국물',                '운영중', 37.4856,  127.0368,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='재재')),
      ('타이 키친 양재',            '아시안',    '팟타이, 똠얌꿍',           '남서',    'dinner',   'https://map.naver.com/v5/?seed=15', '회식용 매콤한 태국식',     '운영중', 37.4817,  127.0344,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='닭닭이')),

      -- 카페
      ('카페 양재로스터스',         '카페',      '스페셜티 커피, 디저트',    '북서',    'lunch',    'https://map.naver.com/v5/?seed=16', '식후 커피',                '운영중', 37.4852,  127.0350,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='백백')),
      ('브런치 카페 양재',          '카페',      '에그베네딕트, 샌드위치',   '중앙',    'lunch',    'https://map.naver.com/v5/?seed=17', '주말 브런치',              '휴업',   37.4836,  127.0357,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='JJJJ')),

      -- 기타
      ('회덮밥+알탕 양재',          '기타',      '회덮밥, 알탕 세트',        '남동',    'lunch',    'https://map.naver.com/v5/?seed=18', '점심 한정',                '운영중', 37.4828,  127.0382,    NULL,            (SELECT id FROM public.reviewers WHERE nickname='리리'));
  END IF;
END
$seed_restaurants$;

-- ---------------------------------------------------------------------------
-- 3. ratings — 식당당 0~5건, 일부 식당은 0건 (빈 상태 UI 검증)
--    UNIQUE(restaurant_id, reviewer_id) 위반은 ON CONFLICT DO NOTHING.
--    setseed() 로 무작위성을 고정 → 재실행 결과 동일.
-- ---------------------------------------------------------------------------
DO $seed_ratings$
DECLARE
  -- 식당별 평가자 목록 (닉네임). NULL/빈 배열은 0건 = 빈 상태 UI 검증용.
  v_plan jsonb := jsonb_build_object(
    '양재골 김치찌개',     jsonb_build_array('케빈','엠팍','시니','젱젱','재재'),  -- 5건
    '양재 본가 갈비탕',    jsonb_build_array('엠팍','시니','백백','JJJJ'),         -- 4건
    '순대국집 양재점',     jsonb_build_array('시니','닭닭이','리리'),               -- 3건
    '매운갈비찜 양재본점', jsonb_build_array('젱젱','재재','닭닭이','백백','리리'), -- 5건 (회식)
    '돈카츠 양재',         jsonb_build_array('재재','케빈','JJJJ'),                 -- 3건
    '우동 양재',           jsonb_build_array('닭닭이','케빈'),                      -- 2건 (휴업)
    '스시 양재',           jsonb_build_array('백백','젱젱','시니','JJJJ','리리'),   -- 5건 (회식)
    '짬뽕왕 양재',         jsonb_build_array('JJJJ','엠팍','케빈','재재'),          -- 4건
    '북경반점 양재',       jsonb_build_array('리리','백백'),                        -- 2건 (폐업, 과거 평가)
    '김밥천국 양재',       jsonb_build_array('케빈','시니','젱젱'),                 -- 3건
    '떡볶이 양재분식',     jsonb_build_array('엠팍','재재','닭닭이','리리'),        -- 4건
    '버거킹 양재역점',     jsonb_build_array('시니'),                               -- 1건
    'KFC 양재점',          jsonb_build_array(),                                     -- 0건 (폐업, 평가 없음)
    '쌀국수 양재',         jsonb_build_array('재재','백백','JJJJ','리리','케빈'),   -- 5건
    '타이 키친 양재',      jsonb_build_array('닭닭이','젱젱','엠팍'),               -- 3건
    '카페 양재로스터스',   jsonb_build_array('백백','시니'),                        -- 2건
    '브런치 카페 양재',    jsonb_build_array(),                                     -- 0건 (빈 상태)
    '회덮밥+알탕 양재',    jsonb_build_array('리리','케빈','JJJJ','엠팍')           -- 4건
  );

  -- 결정론적 점수/코멘트 풀
  v_scores numeric[] := ARRAY[3.0,3.5,4.0,4.5,5.0,4.0,3.5,4.5,5.0,4.0,3.0,4.5];
  v_comments text[] := ARRAY[
    '가성비 최고. 점심 추천.',
    '국물이 진하고 양도 많아요.',
    '회식 자리로 적당함.',
    '재방문 의사 있음.',
    '대기 좀 있지만 맛은 보장.',
    '맛은 평범하지만 가까워서 자주 감.',
    '메뉴 다양해서 좋아요.',
    '점심특선 가성비 굿.',
    '직원 친절합니다.',
    '회식 코스 무난.',
    NULL,
    '깔끔하고 빠른 회전.'
  ];

  v_rest record;
  v_nick text;
  v_reviewer_id uuid;
  v_idx int := 0;
  v_score numeric;
  v_comment text;
BEGIN
  PERFORM setseed(0.42);  -- 시드 고정 (현재는 결정론적 인덱스 사용이지만 안전망)

  FOR v_rest IN
    SELECT id, name FROM public.restaurants
    WHERE name IN (SELECT jsonb_object_keys(v_plan))
  LOOP
    FOR v_nick IN
      SELECT jsonb_array_elements_text(v_plan -> v_rest.name)
    LOOP
      SELECT id INTO v_reviewer_id
        FROM public.reviewers WHERE nickname = v_nick;

      IF v_reviewer_id IS NULL THEN
        CONTINUE;
      END IF;

      v_idx := v_idx + 1;
      v_score   := v_scores[((v_idx - 1) % array_length(v_scores, 1)) + 1];
      v_comment := v_comments[((v_idx - 1) % array_length(v_comments, 1)) + 1];

      INSERT INTO public.ratings (restaurant_id, reviewer_id, score, comment)
      VALUES (v_rest.id, v_reviewer_id, v_score, v_comment)
      ON CONFLICT (restaurant_id, reviewer_id) DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[seed] ratings 삽입 시도 완료 (총 % 건 시도)', v_idx;
END
$seed_ratings$;

-- ============================================================================
-- End of 20260514_003_seed.sql
-- ============================================================================;
