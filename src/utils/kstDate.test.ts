/**
 * KST 날짜 유틸 테스트 — 방문 체크인 날짜(visited_on)와 "최근 7일" 창의 계약.
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md §6
 */

import { describe, expect, it } from 'vitest'
import { kstDateString, kstDaysAgo } from './kstDate'

describe('kstDateString', () => {
  it('UTC 14:59는 KST 같은 날 23:59', () => {
    expect(kstDateString(new Date('2026-10-08T14:59:00Z'))).toBe('2026-10-08')
  })

  it('UTC 15:00은 KST 다음 날 00:00', () => {
    expect(kstDateString(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-09')
  })
})

describe('kstDaysAgo', () => {
  it('KST 오늘 기준 N일 전 날짜', () => {
    expect(kstDaysAgo(6, new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-02')
  })

  it('월 경계를 넘는다', () => {
    expect(kstDaysAgo(6, new Date('2026-10-03T03:00:00Z'))).toBe('2026-09-27')
  })

  it('0일 전은 KST 오늘', () => {
    expect(kstDaysAgo(0, new Date('2026-10-08T15:30:00Z'))).toBe('2026-10-09')
  })
})
