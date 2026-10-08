/**
 * 데스크톱 TOP5 순위 규칙 (2026-10-07).
 * 설계: doc/plan/features/2026-10-07-desktop-top5-design.md §2
 *
 * - 대상: 운영중 + 해당 시트 + 평가 MIN_RATING_COUNT건 이상 (1건짜리 5점 독주 방지)
 * - 정렬: 평균 ↓ → 평가 수 ↓ → 이름 ↑
 * - 리스트 패널의 검색·필터와 무관한 전체 기준.
 */

import type { RestaurantWithStats, SheetType } from '@/types/domain'

export const MIN_RATING_COUNT = 2

export function selectTopRanked(
  restaurants: RestaurantWithStats[],
  sheetType: SheetType,
  limit = 5,
): RestaurantWithStats[] {
  return restaurants
    .filter(
      (r) =>
        r.status === '운영중' &&
        r.sheet_type === sheetType &&
        r.avg_score !== null &&
        r.rating_count >= MIN_RATING_COUNT,
    )
    .sort(
      (a, b) =>
        (b.avg_score as number) - (a.avg_score as number) ||
        b.rating_count - a.rating_count ||
        a.name.localeCompare(b.name, 'ko'),
    )
    .slice(0, limit)
}
