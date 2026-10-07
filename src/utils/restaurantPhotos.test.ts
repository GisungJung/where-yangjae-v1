/**
 * 식당 사진 규칙 단위 테스트 — 대표 선택·저장 계획.
 * 설계: doc/plan/features/2026-10-07-restaurant-photos-design.md §3
 */

import { describe, expect, it } from 'vitest'
import type { RestaurantPhoto } from '../types/domain'
import { groupPhotosByRestaurant, pickCover, planPhotoSave } from './restaurantPhotos'

const R1 = '11111111-1111-4111-8111-111111111111'
const R2 = '22222222-2222-4222-8222-222222222222'

function photo(over: Partial<RestaurantPhoto>): RestaurantPhoto {
  return {
    id: over.id ?? crypto.randomUUID(),
    restaurant_id: R1,
    storage_path: 'x.jpg',
    thumb_path: 'x_t.jpg',
    sort_order: 0,
    is_cover: false,
    byte_size: null,
    width: null,
    height: null,
    created_at: '2026-10-07T00:00:00Z',
    ...over,
  }
}

describe('pickCover', () => {
  it('is_cover 행을 우선한다', () => {
    const a = photo({ sort_order: 0 })
    const b = photo({ sort_order: 1, is_cover: true })
    expect(pickCover([a, b])).toBe(b)
  })

  it('is_cover가 없으면 sort_order 최소 행', () => {
    const a = photo({ sort_order: 2 })
    const b = photo({ sort_order: 1 })
    expect(pickCover([a, b])).toBe(b)
  })

  it('빈 배열이면 null', () => {
    expect(pickCover([])).toBeNull()
  })
})

describe('groupPhotosByRestaurant', () => {
  it('식당별로 묶고 sort_order 오름차순 정렬', () => {
    const a = photo({ sort_order: 2 })
    const b = photo({ sort_order: 0 })
    const c = photo({ restaurant_id: R2 })
    const map = groupPhotosByRestaurant([a, b, c])
    expect(map.get(R1)).toEqual([b, a])
    expect(map.get(R2)).toEqual([c])
  })
})

describe('planPhotoSave', () => {
  it('신규 등록: 빈 슬롯 0,1,2를 순서대로 배정', () => {
    const plan = planPhotoSave([], [{ key: 'n1' }, { key: 'n2' }], 'n2')
    expect(plan.toDelete).toEqual([])
    expect(plan.toAdd).toEqual([
      { key: 'n1', sortOrder: 0 },
      { key: 'n2', sortOrder: 1 },
    ])
    expect(plan.coverKey).toBe('n2')
  })

  it('수정: 빠진 기존 사진은 삭제, 신규는 남은 빈 슬롯에 배정', () => {
    const p0 = photo({ id: 'p0', sort_order: 0 })
    const p1 = photo({ id: 'p1', sort_order: 1 })
    const plan = planPhotoSave(
      [p0, p1],
      [{ key: 'p1', savedId: 'p1' }, { key: 'n1' }, { key: 'n2' }],
      'p1',
    )
    expect(plan.toDelete).toEqual([p0])
    expect(plan.toAdd).toEqual([
      { key: 'n1', sortOrder: 0 },
      { key: 'n2', sortOrder: 2 },
    ])
  })

  it('대표 키가 목록에 없으면 첫 항목이 대표', () => {
    const plan = planPhotoSave([], [{ key: 'n1' }], 'gone')
    expect(plan.coverKey).toBe('n1')
  })

  it('사진이 0장이면 대표 없음', () => {
    expect(planPhotoSave([], [], null).coverKey).toBeNull()
  })

  it('최대 3장 초과분은 배정하지 않는다', () => {
    const plan = planPhotoSave(
      [],
      [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }],
      'a',
    )
    expect(plan.toAdd.map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })
})
