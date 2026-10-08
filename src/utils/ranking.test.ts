/**
 * selectTopRanked 단위 테스트 — 데스크톱 TOP5 순위 규칙의 계약.
 * 설계: doc/plan/features/2026-10-07-desktop-top5-design.md §2
 */

import { describe, expect, it } from 'vitest'
import type { RestaurantWithStats } from '@/types/domain'
import { selectTopRanked } from './ranking'

let seq = 0
function make(over: Partial<RestaurantWithStats>): RestaurantWithStats {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    name: `식당${seq}`,
    category: '한식',
    menu: null,
    sheet_type: 'lunch',
    region: null,
    naver_url: null,
    note: null,
    status: '운영중',
    lat: null,
    lng: null,
    kakao_place_id: null,
    registered_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    rating_count: 3,
    avg_score: 4,
    visits_7d: 0,
    visits_total: 0,
    ...over,
  }
}

describe('selectTopRanked', () => {
  it('평균 내림차순으로 최대 5개를 반환한다', () => {
    const list = [1, 4.5, 3, 5, 2, 4, 3.5].map((s) =>
      make({ avg_score: s, name: `s${s}` }),
    )
    const top = selectTopRanked(list, 'lunch')
    expect(top.map((r) => r.avg_score)).toEqual([5, 4.5, 4, 3.5, 3])
  })

  it('해당 sheet_type만 포함한다', () => {
    const lunch = make({ sheet_type: 'lunch' })
    const dinner = make({ sheet_type: 'dinner' })
    expect(selectTopRanked([lunch, dinner], 'dinner')).toEqual([dinner])
  })

  it('평가 2건 미만과 평균 null은 제외한다', () => {
    const one = make({ rating_count: 1, avg_score: 5 })
    const none = make({ rating_count: 0, avg_score: null })
    const two = make({ rating_count: 2, avg_score: 3 })
    expect(selectTopRanked([one, none, two], 'lunch')).toEqual([two])
  })

  it('운영중이 아닌 식당은 제외한다', () => {
    const paused = make({ status: '휴업', avg_score: 5 })
    const closed = make({ status: '폐업', avg_score: 5 })
    const open = make({ avg_score: 3 })
    expect(selectTopRanked([paused, closed, open], 'lunch')).toEqual([open])
  })

  it('동점이면 평가 수 많은 순, 그다음 이름순', () => {
    const a = make({ name: '나', avg_score: 4, rating_count: 2 })
    const b = make({ name: '다', avg_score: 4, rating_count: 5 })
    const c = make({ name: '가', avg_score: 4, rating_count: 2 })
    expect(selectTopRanked([a, b, c], 'lunch').map((r) => r.name)).toEqual([
      '다',
      '가',
      '나',
    ])
  })

  it('limit 인자로 개수를 바꿀 수 있다', () => {
    const list = [1, 2, 3].map((s) => make({ avg_score: s }))
    expect(selectTopRanked(list, 'lunch', 2)).toHaveLength(2)
  })
})
