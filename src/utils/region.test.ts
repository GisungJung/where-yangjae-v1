/**
 * nearestRegion 단위 테스트 — 지역 파생 규칙의 계약.
 * 설계: doc/plan/features/2026-09-03-region-derived-design.md §5
 */

import { describe, expect, it } from 'vitest'
import { distanceKm, nearestRegion, type RegionPoint } from './region'

const REGIONS: RegionPoint[] = [
  { name: '양재', lat: 37.4842, lng: 127.0344 },
  { name: '남부터미널', lat: 37.4765, lng: 127.0048 },
]

describe('nearestRegion', () => {
  it('양재역 근처 좌표는 양재로 분류된다', () => {
    // 양재역에서 북동쪽 약 200m
    expect(nearestRegion(37.4855, 127.036, REGIONS)).toBe('양재')
  })

  it('남부터미널역 근처 좌표는 남부터미널로 분류된다', () => {
    // 남부터미널역에서 남쪽 약 150m
    expect(nearestRegion(37.4752, 127.0045, REGIONS)).toBe('남부터미널')
  })

  it('좌표가 없으면 null (지역 미지정)', () => {
    expect(nearestRegion(null, null, REGIONS)).toBeNull()
    expect(nearestRegion(37.48, null, REGIONS)).toBeNull()
    expect(nearestRegion(null, 127.0, REGIONS)).toBeNull()
  })

  it('기준점 목록이 비어 있으면 null', () => {
    expect(nearestRegion(37.4842, 127.0344, [])).toBeNull()
  })

  it('등거리면 목록 순서상 첫 기준점 (안정성 계약)', () => {
    const twins: RegionPoint[] = [
      { name: 'A', lat: 37.48, lng: 127.0 },
      { name: 'B', lat: 37.48, lng: 127.0 },
    ]
    expect(nearestRegion(37.49, 127.01, twins)).toBe('A')
  })
})

describe('distanceKm', () => {
  it('같은 좌표는 0km', () => {
    expect(distanceKm(37.4842, 127.0344, 37.4842, 127.0344)).toBe(0)
  })

  it('양재역-남부터미널역은 약 2.7km (실거리 검증)', () => {
    const d = distanceKm(37.4842, 127.0344, 37.4765, 127.0048)
    expect(d).toBeGreaterThan(2.5)
    expect(d).toBeLessThan(3.0)
  })

  it('인자 순서를 바꿔도 같은 거리 (대칭성)', () => {
    const a = distanceKm(37.4842, 127.0344, 37.4765, 127.0048)
    const b = distanceKm(37.4765, 127.0048, 37.4842, 127.0344)
    expect(a).toBeCloseTo(b, 10)
  })
})
