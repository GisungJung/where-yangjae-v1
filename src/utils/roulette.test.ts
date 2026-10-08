/**
 * 룰렛 규칙 테스트 — 평점 가중치·가중 추첨·최근 방문 제외.
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md §4
 */

import { describe, expect, it } from 'vitest'
import { applyRecentExclusion, ratingWeights, weightedPick } from './roulette'

type Item = { id: string; avg_score: number | null; rating_count: number }

const rated = (id: string, avg: number): Item => ({
  id,
  avg_score: avg,
  rating_count: 2,
})
const unrated = (id: string): Item => ({ id, avg_score: null, rating_count: 0 })

describe('ratingWeights', () => {
  it('평가 있는 곳은 평균 별점이 가중치', () => {
    expect(ratingWeights([rated('a', 4.5), rated('b', 3)])).toEqual([4.5, 3])
  })

  it('평가 없는 곳은 평가 있는 곳들의 평균', () => {
    expect(ratingWeights([rated('a', 4), rated('b', 2), unrated('c')])).toEqual([
      4, 2, 3,
    ])
  })

  it('전부 평가 없으면 3.0', () => {
    expect(ratingWeights([unrated('a'), unrated('b')])).toEqual([3, 3])
  })

  it('0점(과거 데이터)은 0.5로 보정해 확률 0을 막는다', () => {
    expect(ratingWeights([rated('a', 0), rated('b', 4)])).toEqual([0.5, 4])
  })
})

describe('weightedPick', () => {
  const items = ['A', 'B']
  const weights = [1, 3] // A 25%, B 75%

  it('난수 구간 경계대로 고른다', () => {
    expect(weightedPick(items, weights, () => 0)).toBe('A')
    expect(weightedPick(items, weights, () => 0.2499)).toBe('A')
    expect(weightedPick(items, weights, () => 0.25)).toBe('B')
    expect(weightedPick(items, weights, () => 0.9999)).toBe('B')
  })

  it('빈 배열이면 null', () => {
    expect(weightedPick([], [], () => 0.5)).toBeNull()
  })

  it('가중치 합이 0 이하면 균등 추첨', () => {
    expect(weightedPick(items, [0, 0], () => 0.6)).toBe('B')
  })
})

describe('applyRecentExclusion', () => {
  const pool = [rated('a', 4), rated('b', 4), rated('c', 4)]

  it('최근 방문한 곳을 빼고 제외 수를 알려준다', () => {
    const r = applyRecentExclusion(pool, new Set(['b']))
    expect(r.candidates.map((x) => x.id)).toEqual(['a', 'c'])
    expect(r.excludedCount).toBe(1)
    expect(r.fallbackUsed).toBe(false)
  })

  it('전부 최근 방문이면 제외를 풀고 fallbackUsed', () => {
    const r = applyRecentExclusion(pool, new Set(['a', 'b', 'c']))
    expect(r.candidates).toHaveLength(3)
    expect(r.fallbackUsed).toBe(true)
  })

  it('최근 방문이 없으면 그대로', () => {
    const r = applyRecentExclusion(pool, new Set())
    expect(r.candidates).toHaveLength(3)
    expect(r.excludedCount).toBe(0)
    expect(r.fallbackUsed).toBe(false)
  })

  it('후보가 원래 0곳이면 폴백 없이 빈 결과', () => {
    const r = applyRecentExclusion([], new Set(['a']))
    expect(r.candidates).toEqual([])
    expect(r.fallbackUsed).toBe(false)
  })
})
