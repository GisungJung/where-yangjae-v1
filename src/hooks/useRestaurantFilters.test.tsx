/**
 * useRestaurantFilters 훅 단위 테스트.
 *
 * HomePage에서 추출된 필터·정렬·페이징 로직의 계약을 고정한다:
 *  - 휴업·폐업은 기본 제외, showInactive=true면 포함
 *  - sheetType / 카테고리 / 키워드(이름+메뉴) 필터
 *  - 정렬 3종 (score / count / name)
 *  - 필터 변경 시 visibleCount가 PAGE_SIZE로 리셋, loadMore로 증가
 */

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RestaurantWithStats } from '../types/domain'
import {
  PAGE_SIZE,
  useRestaurantFilters,
} from './useRestaurantFilters'

let seq = 0
function mk(over: Partial<RestaurantWithStats>): RestaurantWithStats {
  seq += 1
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`,
    name: `식당${seq}`,
    category: '한식',
    menu: null,
    sheet_type: 'lunch',
    region: '양재',
    naver_url: null,
    note: null,
    status: '운영중',
    lat: null,
    lng: null,
    kakao_place_id: null,
    registered_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    rating_count: 0,
    avg_score: null,
    ...over,
  }
}

describe('useRestaurantFilters', () => {
  it('휴업·폐업은 기본 제외하고 showInactive=true면 포함한다', () => {
    const list = [
      mk({ name: '운영' }),
      mk({ name: '휴업집', status: '휴업' }),
      mk({ name: '폐업집', status: '폐업' }),
    ]
    const { result } = renderHook(() => useRestaurantFilters(list))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['운영'])

    act(() => result.current.setShowInactive(true))
    expect(result.current.sorted).toHaveLength(3)
  })

  it('sheetType·카테고리·키워드(이름+메뉴)로 필터링한다', () => {
    const list = [
      mk({ name: '김밥천국', category: '분식', sheet_type: 'lunch', menu: '라면' }),
      mk({ name: '스시집', category: '일식', sheet_type: 'dinner' }),
      mk({ name: '국밥집', category: '한식', sheet_type: 'lunch', menu: '순대국' }),
    ]
    const { result } = renderHook(() => useRestaurantFilters(list))

    act(() => result.current.setSheetType('lunch'))
    expect(result.current.sorted).toHaveLength(2)

    act(() => result.current.toggleCategory('분식'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['김밥천국'])

    act(() => result.current.toggleCategory('분식')) // 해제
    act(() => result.current.setKeyword('순대'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['국밥집'])
  })

  it('score 정렬은 평점 내림차순, 동점이면 평가수 내림차순', () => {
    const list = [
      mk({ name: 'B', avg_score: 4.0, rating_count: 2 }),
      mk({ name: 'A', avg_score: 4.5, rating_count: 1 }),
      mk({ name: 'C', avg_score: 4.0, rating_count: 9 }),
      mk({ name: 'D', avg_score: null, rating_count: 0 }),
    ]
    const { result } = renderHook(() => useRestaurantFilters(list))
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'A',
      'C',
      'B',
      'D',
    ])
  })

  it('count 정렬과 name 가나다 정렬을 지원한다', () => {
    const list = [
      mk({ name: '다', rating_count: 1, avg_score: 5 }),
      mk({ name: '가', rating_count: 3, avg_score: 3 }),
      mk({ name: '나', rating_count: 3, avg_score: 4 }),
    ]
    const { result } = renderHook(() => useRestaurantFilters(list))

    act(() => result.current.setSortKey('count'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['나', '가', '다'])

    act(() => result.current.setSortKey('name'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['가', '나', '다'])
  })

  it('loadMore로 페이지가 늘고 필터가 바뀌면 PAGE_SIZE로 리셋된다', () => {
    const list = Array.from({ length: 25 }, (_, i) =>
      mk({ name: `가게${String(i).padStart(2, '0')}` }),
    )
    const { result } = renderHook(() => useRestaurantFilters(list))

    expect(result.current.visible).toHaveLength(PAGE_SIZE)
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    expect(result.current.visible).toHaveLength(PAGE_SIZE * 2)

    act(() => result.current.setKeyword('가게'))
    expect(result.current.visible).toHaveLength(PAGE_SIZE)
  })
})
