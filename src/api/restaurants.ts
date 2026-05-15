/**
 * 식당 관련 Supabase 쿼리.
 *
 * - 뷰 `restaurant_stats`가 존재하지 않을 수도 있는 상태(dba 마이그레이션 미적용)를
 *   가정해, 뷰 조회 실패 시 평점 0건으로 fallback 한다.
 * - 테이블 자체가 없는 경우(`missingTable: true`)와 비어 있는 경우를 구분해
 *   호출부의 EmptyState가 다른 안내를 보여줄 수 있게 한다.
 * - 정렬은 클라이언트에서 처리. 식당 ~80개 규모로 충분.
 */

import { supabase } from '../lib/supabase'
import {
  RestaurantSchema,
  RestaurantStatsSchema,
  type NewRestaurantInput,
  type Restaurant,
  type RestaurantStats,
  type RestaurantWithStats,
} from '../types/domain'
import { upsertReviewerByNickname } from './reviewers'

export interface FetchRestaurantsResult {
  data: RestaurantWithStats[]
  /** restaurants 테이블 자체가 없으면 true (마이그레이션 대기 상태) */
  missingTable: boolean
}

/** 모든 식당 + 통계를 가져온다. 통계 뷰가 없으면 0으로 채운다. */
export async function fetchRestaurantsWithStats(): Promise<FetchRestaurantsResult> {
  const { data: restaurantRows, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false })

  if (restaurantError) {
    if (isMissingRelation(restaurantError.message)) {
      console.warn(
        '[restaurants] 테이블이 아직 생성되지 않았습니다 (dba 마이그레이션 대기 중).',
      )
      return { data: [], missingTable: true }
    }
    throw restaurantError
  }

  const restaurants: Restaurant[] = (restaurantRows ?? [])
    .map((row) => RestaurantSchema.safeParse(row))
    .flatMap((r) => (r.success ? [r.data] : []))

  // 뷰 조회 — 실패해도 본 식당 목록은 살린다.
  let statsMap = new Map<string, RestaurantStats>()
  try {
    const { data: statsRows, error: statsError } = await supabase
      .from('restaurant_stats')
      .select('*')
    if (statsError) throw statsError
    statsMap = new Map(
      (statsRows ?? [])
        .map((row) => RestaurantStatsSchema.safeParse(row))
        .flatMap((r) => (r.success ? [[r.data.id, r.data] as const] : [])),
    )
  } catch (err) {
    console.warn(
      '[restaurant_stats] 뷰 조회 실패 — 평점 0건으로 폴백합니다.',
      err,
    )
  }

  const data = restaurants.map((r) => ({
    ...r,
    rating_count: statsMap.get(r.id)?.rating_count ?? 0,
    avg_score: statsMap.get(r.id)?.avg_score ?? null,
  }))
  return { data, missingTable: false }
}

/** 단일 식당 + 통계 */
export async function fetchRestaurantById(
  id: string,
): Promise<RestaurantWithStats | null> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingRelation(error.message)) {
      console.warn('[restaurants] 테이블 미생성 — null 반환')
      return null
    }
    throw error
  }
  if (!data) return null

  const parsed = RestaurantSchema.safeParse(data)
  if (!parsed.success) {
    console.warn('[restaurants] 응답 파싱 실패', parsed.error)
    return null
  }

  let stats: RestaurantStats | null = null
  try {
    const { data: statsRow, error: statsError } = await supabase
      .from('restaurant_stats')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (statsError) throw statsError
    if (statsRow) {
      const parsedStats = RestaurantStatsSchema.safeParse(statsRow)
      if (parsedStats.success) stats = parsedStats.data
    }
  } catch (err) {
    console.warn('[restaurant_stats] 단건 조회 실패 — 0건으로 폴백.', err)
  }

  return {
    ...parsed.data,
    rating_count: stats?.rating_count ?? 0,
    avg_score: stats?.avg_score ?? null,
  }
}

/* ──────────────────────────────────────────────────────────
 * 룰렛 (기획서 §8.5)
 * ────────────────────────────────────────────────────────── */

export interface PickRandomRestaurantInput {
  sheetType: 'lunch' | 'dinner' | null
  categories: string[] | null
  includeClosed: boolean
}

/**
 * 무작위 식당 1건 추천.
 *
 * dba가 정의한 `pick_random_restaurant(p_sheet_type, p_categories, p_include_closed)`
 * RPC를 호출한다. 조건에 맞는 식당이 없으면 null.
 *
 * RPC가 아직 배포되지 않은 경우(`does not exist`)에는
 * 폴백으로 `fetchRestaurantsWithStats()` 결과를 클라이언트 필터링 후
 * Math.random()으로 추첨한다.
 */
export async function pickRandomRestaurant(
  input: PickRandomRestaurantInput,
): Promise<Restaurant | null> {
  const { data, error } = await supabase.rpc('pick_random_restaurant', {
    p_sheet_type: input.sheetType,
    p_categories:
      input.categories && input.categories.length > 0 ? input.categories : null,
    p_include_closed: input.includeClosed,
  })

  if (error) {
    if (isMissingRelation(error.message) || error.message.includes('function')) {
      console.warn(
        '[pick_random_restaurant] RPC 미배포 — 클라이언트 폴백을 사용합니다.',
        error.message,
      )
      return pickRandomClientFallback(input)
    }
    throw new Error(`추천을 가져오지 못했어요. (${error.message})`)
  }
  // dba가 RPC를 `RETURNS restaurants` 또는 `RETURNS SETOF restaurants` 어느 쪽으로
  // 정의하든 안전하게 받기 위해 단일/배열 양쪽을 정규화한다.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  const parsed = RestaurantSchema.safeParse(row)
  return parsed.success ? parsed.data : null
}

/** RPC 폴백 — 식당 ~80건 규모라 클라이언트 필터링도 가벼움. */
async function pickRandomClientFallback(
  input: PickRandomRestaurantInput,
): Promise<Restaurant | null> {
  const { data } = await fetchRestaurantsWithStats()
  const pool = data.filter((r) => {
    if (!input.includeClosed && r.status !== '운영중') return false
    if (input.sheetType && r.sheet_type !== input.sheetType) return false
    if (
      input.categories &&
      input.categories.length > 0 &&
      !input.categories.includes(r.category)
    ) {
      return false
    }
    return true
  })
  if (pool.length === 0) return null
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx]
}

/* ──────────────────────────────────────────────────────────
 * 맛집 등록 (기획서 §8.4)
 * ────────────────────────────────────────────────────────── */

export interface InsertRestaurantResult {
  restaurant: Restaurant
  reviewerId: string
}

/**
 * 새 식당 INSERT — 등록자 닉네임을 reviewer로 upsert 후 `registered_by`에 박는다.
 *
 * 카카오 장소가 선택된 경우 lat/lng/kakao_place_id가 함께 채워진다.
 * 빈 문자열 필드는 null로 정규화해 DB에 저장한다.
 */
export async function insertRestaurant(
  input: NewRestaurantInput,
): Promise<InsertRestaurantResult> {
  const reviewer = await upsertReviewerByNickname(input.nickname)

  const payload = {
    name: input.name.trim(),
    category: input.category,
    sheet_type: input.sheet_type,
    menu: input.menu?.trim() ? input.menu.trim() : null,
    note: input.note?.trim() ? input.note.trim() : null,
    naver_url: input.naver_url?.trim() ? input.naver_url.trim() : null,
    lat: input.lat,
    lng: input.lng,
    kakao_place_id: input.kakao_place_id,
    registered_by: reviewer.id,
  }

  const { data, error } = await supabase
    .from('restaurants')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw new Error(`맛집을 등록하지 못했어요. (${error.message})`)
  }

  const parsed = RestaurantSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('등록 결과가 올바르지 않습니다.')
  }
  return { restaurant: parsed.data, reviewerId: reviewer.id }
}

/* ──────────────────────────────────────────────────────────
 * 식당 정보 수정 (task #3)
 *
 * `registered_by` / `created_at`은 보존. `updated_at`은 DB 트리거가 갱신.
 * RLS: `restaurants_update_all` (anon 허용 — 마이그레이션 20260514120008).
 * ────────────────────────────────────────────────────────── */

export type UpdateRestaurantInput = Pick<
  NewRestaurantInput,
  | 'name'
  | 'category'
  | 'sheet_type'
  | 'menu'
  | 'note'
  | 'naver_url'
  | 'lat'
  | 'lng'
  | 'kakao_place_id'
>

export async function updateRestaurant(
  id: string,
  input: UpdateRestaurantInput,
): Promise<Restaurant> {
  // dba 가이드 (task #3 답신):
  // - payload에 `updated_at` 포함 X → BEFORE UPDATE 트리거가 갱신.
  // - payload에 `registered_by` 포함 X → 미명시 컬럼은 기존 값 보존.
  const payload = {
    name: input.name.trim(),
    category: input.category,
    sheet_type: input.sheet_type,
    menu: input.menu?.trim() ? input.menu.trim() : null,
    note: input.note?.trim() ? input.note.trim() : null,
    naver_url: input.naver_url?.trim() ? input.naver_url.trim() : null,
    lat: input.lat,
    lng: input.lng,
    kakao_place_id: input.kakao_place_id,
  }

  const { data, error } = await supabase
    .from('restaurants')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    // Postgres CHECK violation (category·sheet_type·status enum 어김).
    // RLS는 UPDATE_ALL이라 권한 거부는 발생하지 않음 → 0행 = id 부재 케이스.
    const code = (error as { code?: string }).code
    if (code === '23514') {
      throw new Error('값이 허용 범위가 아닙니다. 다시 선택해 주세요.')
    }
    throw new Error(`수정에 실패했어요. (${error.message})`)
  }
  if (!data) {
    throw new Error('식당을 찾지 못했어요. (id 부재)')
  }
  const parsed = RestaurantSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('수정 결과가 올바르지 않습니다.')
  }
  return parsed.data
}

/* ──────────────────────────────────────────────────────────
 * 상태 변경 (휴업·운영중·폐업)
 * ──────────────────────────────────────────────────────────
 *
 * Soft delete 정책 — 폐업도 status 전이만 일어남 (기획서 §11.2).
 * 평가 데이터는 보존.
 */

export async function updateRestaurantStatus(
  id: string,
  status: '운영중' | '휴업' | '폐업',
): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`상태를 변경하지 못했어요. (${error.message})`)
  }
  const parsed = RestaurantSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('상태 변경 응답이 올바르지 않습니다.')
  }
  return parsed.data
}

function isMissingRelation(message: string): boolean {
  // PostgREST 42P01 (undefined_table) 텍스트 패턴
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.toLowerCase().includes('not found')
  )
}
