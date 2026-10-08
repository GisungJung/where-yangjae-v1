/**
 * 방문 체크인 API (2026-10-08).
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md §3
 *
 * - restaurant_visits: RLS로 본인 행만 SELECT/INSERT/DELETE (x-reviewer-id 헤더).
 *   INSERT는 visited_on = KST 오늘만 허용 — visited_on은 DB 기본값에 맡긴다.
 * - 집계는 SECURITY DEFINER RPC `restaurant_visit_stats()` — 숫자만 반환.
 * - 테이블/RPC 미적용 시: 내 기록은 available=false(체크인 UI 숨김), 집계는 빈 Map(0 폴백).
 */

import { supabase } from '@/lib/supabase'
import {
  RestaurantVisitSchema,
  RestaurantVisitStatsSchema,
  type RestaurantVisit,
  type RestaurantVisitStats,
} from '@/types/domain'
import { kstDateString, kstDaysAgo } from '@/utils/kstDate'
import { RECENT_VISIT_DAYS } from '@/utils/roulette'

/** 식당별 방문 집계. RPC 부재·오류 시 빈 Map (호출부가 0으로 채움). */
export async function fetchVisitStatsMap(): Promise<
  Map<string, RestaurantVisitStats>
> {
  const { data, error } = await supabase.rpc('restaurant_visit_stats')
  if (error) {
    console.warn('[restaurant_visit_stats] 집계 조회 실패 — 방문 0으로 폴백.', error.message)
    return new Map()
  }
  return new Map(
    (data ?? [])
      .map((row) => RestaurantVisitStatsSchema.safeParse(row))
      .flatMap((r) => (r.success ? [[r.data.restaurant_id, r.data] as const] : [])),
  )
}

export interface MyRecentVisits {
  /** 테이블이 존재하는지 — false면 체크인 기능 전체를 숨긴다 */
  available: boolean
  /** 오늘 포함 최근 RECENT_VISIT_DAYS일의 내 체크인 (RLS가 본인 행만 반환) */
  visits: RestaurantVisit[]
}

export async function fetchMyRecentVisits(): Promise<MyRecentVisits> {
  const { data, error } = await supabase
    .from('restaurant_visits')
    .select('*')
    .gte('visited_on', kstDaysAgo(RECENT_VISIT_DAYS - 1))
    .order('visited_on', { ascending: false })

  if (error) {
    if (isMissingRelation(error.message)) {
      console.warn('[restaurant_visits] 테이블 미적용 — 체크인 기능을 숨깁니다.')
      return { available: false, visits: [] }
    }
    throw new Error(`방문 기록을 불러오지 못했어요. (${error.message})`)
  }
  return {
    available: true,
    visits: (data ?? [])
      .map((row) => RestaurantVisitSchema.safeParse(row))
      .flatMap((r) => (r.success ? [r.data] : [])),
  }
}

/**
 * 오늘 방문 기록. 같은 날 중복(23505)이면 기존 기록을 돌려준다(이미 기록 = 성공).
 * reviewerId는 RLS 헤더(x-reviewer-id)와 같아야 하므로 store의 현재 값을 넘긴다.
 */
export async function insertVisit(
  restaurantId: string,
  reviewerId: string,
): Promise<RestaurantVisit> {
  const { data, error } = await supabase
    .from('restaurant_visits')
    .insert({ restaurant_id: restaurantId, reviewer_id: reviewerId })
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const existing = await findTodayVisit(restaurantId)
      if (existing) return existing
    }
    throw new Error(`방문을 기록하지 못했어요. (${error.message})`)
  }
  const parsed = RestaurantVisitSchema.safeParse(data)
  if (!parsed.success) throw new Error('방문 기록 응답이 올바르지 않습니다.')
  return parsed.data
}

async function findTodayVisit(
  restaurantId: string,
): Promise<RestaurantVisit | null> {
  const { data } = await supabase
    .from('restaurant_visits')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('visited_on', kstDateString())
    .maybeSingle()
  const parsed = RestaurantVisitSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** 방문 기록 취소 (본인 행만 — RLS). 이미 지워졌으면 그대로 성공. */
export async function deleteVisit(visitId: string): Promise<void> {
  const { error } = await supabase
    .from('restaurant_visits')
    .delete()
    .eq('id', visitId)
  if (error) throw new Error(`방문 기록을 취소하지 못했어요. (${error.message})`)
}

function isMissingRelation(message: string): boolean {
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.toLowerCase().includes('not found')
  )
}
