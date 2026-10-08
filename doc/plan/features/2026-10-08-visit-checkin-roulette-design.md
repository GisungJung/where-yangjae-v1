# 방문 체크인 + 룰렛 개선 — 설계

- 작성일: 2026-10-08
- 배경: 점심은 "각자 또는 즉흥적"으로 정하는 팀 (투표보다 메뉴 고민·중복 방문 줄이기가 핵심).
  기획서 §17 로드맵 v2 "방문 체크인", 룰렛 "가중치 옵션(v2)"을 구체화.
- 범위 밖: 팀 투표, 회사 기준 도보 거리 (YAGNI — 필요 시 별도 설계).

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 기록 공유 | DB 저장, 화면엔 **집계 숫자만** (개별 기록은 본인만) |
| 룰렛 규칙 | 최근 7일 내 내가 간 곳 제외 + 평점 가중치 (둘 다 토글, 기본 켬) |
| 체크인 지점 | 룰렛 "이 식당 갈래!" = 즉시 기록 + 취소, 상세 "오늘 여기 먹었어요" |
| 목록 | 카드 배지 "🔥 N회"(최근 7일) + 정렬 "요즘 많이 가는 순" |

## 2. 화면

- **룰렛 선택 화면**: 토글 "최근 7일 내가 간 곳 빼기 (N곳 제외)", "평점 높은 곳 더 자주".
  선택값은 기기에 기억(localStorage, 실패해도 기본값으로 동작). 후보 안내에 제외 수 표시.
- **룰렛 결과**: "이 식당 갈래!" → 즉시 오늘 방문 기록, 결과 화면에 머물며
  "✓ 오늘 방문으로 기록했어요 · [취소] [상세 보기]". 닉네임 없으면 인라인 입력,
  "기록 없이 상세 보기"로 건너뛰기 가능.
- **상세**: "오늘 여기 먹었어요" / 기록됨이면 "✓ 오늘 방문함 · 취소".
  집계 "최근 7일 N회 · 누적 M회 방문".
- **카드**: 최근 7일 방문 있으면 별점 옆 "🔥 N회". 정렬 옵션 "요즘 많이 가는 순".
- 제약: "나" = 기기별 reviewerId (폰·PC 기록 분리). 같은 식당 하루 1회.

## 3. 데이터 (schema.sql §2.6 / §6.2 / §7.7)

- `restaurant_visits(id, restaurant_id→restaurants CASCADE, reviewer_id→reviewers CASCADE,
  visited_on date DEFAULT KST 오늘, created_at)` + UNIQUE(reviewer_id, restaurant_id, visited_on).
- RLS: SELECT·DELETE 본인만, INSERT 본인 + `visited_on = KST 오늘`만 (소급 부풀리기 차단),
  UPDATE 정책 없음(차단).
- 집계 RPC `restaurant_visit_stats()` — SECURITY DEFINER로 식당별 `visits_7d`·`visits_total`만 반환.
  (뷰 대신 함수: Advisor security_definer_view 경고 회피 + security_invoker 전환 시 조용한 집계 붕괴 방지)
- 클라이언트: 집계는 `fetchRestaurantsWithStats`/`fetchRestaurantById`에서 합류
  (`RestaurantWithStats.visits_7d / visits_total`, RPC 부재 시 0 폴백).
  내 최근 7일 기록은 `fetchMyRecentVisits()` → `{ available, visits }` (테이블 부재 시 available=false → 체크인 UI 숨김).
- 무료 티어: 20명 × 하루 1~2회 ≈ 1만 행/년(~1MB), 목록 로드당 RPC 1회 추가.

## 4. 룰렛 규칙 (`src/utils/roulette.ts`)

- 가중치 = 평균 별점 비례. 평가 없음 → 후보 중 평가 있는 곳들의 평균(전부 없으면 3.0). 하한 0.5.
- 최근 방문 제외: 오늘 포함 7일(`visited_on >= KST 오늘-6`) 내 내 체크인 식당 제외.
  제외 후 0곳이면 제외 해제 + "최근에 간 곳밖에 없어서 포함했어요" 안내.
- 추첨은 브라우저로 통일(후보 ~80곳). 기존 RPC `pick_random_restaurant`는 DB에 보존, 클라 미사용.
- 슬롯 최소 1.5초 연출 유지.

## 5. 오류 처리

- 같은 날 중복(23505) → 이미 기록으로 간주, 성공 처리.
- 기록·취소 실패 → 인라인 오류 + 재시도, 룰렛 결과 유지.
- 테이블·RPC 부재 → 체크인 UI 숨김, 집계 0, 룰렛은 가중치만.

## 6. 테스트

- `src/utils/roulette.test.ts` — 가중치 추첨(고정 난수 경계), 평가 없음 대체·0점 보정, 최근 방문 제외·0곳 폴백.
- `src/utils/kstDate.test.ts` — KST 날짜 경계(UTC 15:00 전후), N일 전 계산.
- `src/hooks/useRestaurantFilters.test.tsx` — "요즘 많이 가는 순" 정렬.

## 7. 구현 순서

1. 테스트 작성(실패 확인) → `utils/kstDate.ts`, `utils/roulette.ts`, 정렬 구현
2. schema.sql·테이블정의서·`database.ts`·`domain.ts`
3. `api/visits.ts` + 집계 합류, `hooks/useVisits.ts`
4. 화면: 룰렛(토글·추첨·체크인), 상세(버튼·집계), 카드 배지, 정렬 옵션
5. DB 적용(Management API) + 읽기 전용 검증, build·lint·test
