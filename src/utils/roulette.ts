/**
 * 룰렛 규칙 (2026-10-08) — 평점 가중치·가중 추첨·최근 방문 제외.
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md §4
 */

/** 최근 방문 제외 창 — 오늘 포함 7일 */
export const RECENT_VISIT_DAYS = 7

const MIN_WEIGHT = 0.5
const DEFAULT_WEIGHT = 3

type Rated = { avg_score: number | null; rating_count: number }

const hasRating = (r: Rated) => r.rating_count > 0 && r.avg_score !== null

/**
 * 평균 별점 비례 가중치. 평가 없음 → 후보 중 평가 있는 곳들의 평균
 * (전부 없으면 3.0). 0점 과거 데이터는 0.5로 보정해 확률 0을 막는다.
 */
export function ratingWeights(items: Rated[]): number[] {
  const ratedWeights = items
    .filter(hasRating)
    .map((r) => Math.max(r.avg_score as number, MIN_WEIGHT))
  const fallback =
    ratedWeights.length > 0
      ? ratedWeights.reduce((sum, w) => sum + w, 0) / ratedWeights.length
      : DEFAULT_WEIGHT
  return items.map((r) =>
    hasRating(r) ? Math.max(r.avg_score as number, MIN_WEIGHT) : fallback,
  )
}

/** 가중 추첨 — rand()∈[0,1). 가중치 합이 0 이하면 균등 추첨. */
export function weightedPick<T>(
  items: T[],
  weights: number[],
  rand: () => number = Math.random,
): T | null {
  if (items.length === 0) return null
  const total = weights.reduce((sum, w) => sum + Math.max(w, 0), 0)
  if (total <= 0) return items[Math.floor(rand() * items.length)]
  let target = rand() * total
  for (let i = 0; i < items.length; i++) {
    target -= Math.max(weights[i], 0)
    if (target < 0) return items[i]
  }
  return items[items.length - 1]
}

export interface RecentExclusionResult<T> {
  candidates: T[]
  /** 후보 중 최근 방문으로 빠지는(또는 폴백 시 빠졌어야 할) 수 */
  excludedCount: number
  /** 전부 최근 방문이라 제외를 풀었는지 */
  fallbackUsed: boolean
}

/** 최근 방문한 식당 제외 — 제외 후 0곳이면 제외를 풀고 fallbackUsed. */
export function applyRecentExclusion<T extends { id: string }>(
  pool: T[],
  recentIds: ReadonlySet<string>,
): RecentExclusionResult<T> {
  const candidates = pool.filter((r) => !recentIds.has(r.id))
  const excludedCount = pool.length - candidates.length
  if (candidates.length === 0 && pool.length > 0) {
    return { candidates: pool, excludedCount, fallbackUsed: true }
  }
  return { candidates, excludedCount, fallbackUsed: false }
}
