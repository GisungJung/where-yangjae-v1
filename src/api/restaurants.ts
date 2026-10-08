/**
 * 식당 관련 Supabase 쿼리.
 *
 * - 뷰 `restaurant_stats`가 존재하지 않을 수도 있는 상태(dba 마이그레이션 미적용)를
 *   가정해, 뷰 조회 실패 시 평점 0건으로 fallback 한다.
 * - 테이블 자체가 없는 경우(`missingTable: true`)와 비어 있는 경우를 구분해
 *   호출부의 EmptyState가 다른 안내를 보여줄 수 있게 한다.
 * - 정렬은 클라이언트에서 처리. 식당 ~80개 규모로 충분.
 */

import { supabase } from '@/lib/supabase'
import {
  RestaurantSchema,
  RestaurantStatsSchema,
  type NewRestaurantInput,
  type Restaurant,
  type RestaurantStats,
  type RestaurantWithStats,
} from '@/types/domain'
import { upsertReviewerByNickname } from './reviewers'
import { fetchVisitStatsMap } from './visits'

/**
 * api 레이어 반환형 — region은 저장된 동 이름 그대로(raw).
 * "저장값 ?? 최근접 기준점 파생" 폴백 합류는 훅(useRestaurants)에서 처리한다.
 */
export type RestaurantWithStatsRow = RestaurantWithStats

export interface FetchRestaurantsResult {
  data: RestaurantWithStatsRow[]
  /** restaurants 테이블 자체가 없으면 true (마이그레이션 대기 상태) */
  missingTable: boolean
}

/**
 * 모든 식당 + 통계를 가져온다. 통계 뷰가 없으면 0으로 채운다.
 * 방문 집계(RPC restaurant_visit_stats, 2026-10-08)도 병렬로 합류 — 부재 시 0.
 */
export async function fetchRestaurantsWithStats(): Promise<FetchRestaurantsResult> {
  const visitStatsPromise = fetchVisitStatsMap()
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

  const visitStats = await visitStatsPromise
  const data = restaurants.map((r) => ({
    ...r,
    rating_count: statsMap.get(r.id)?.rating_count ?? 0,
    avg_score: statsMap.get(r.id)?.avg_score ?? null,
    visits_7d: visitStats.get(r.id)?.visits_7d ?? 0,
    visits_total: visitStats.get(r.id)?.visits_total ?? 0,
  }))
  return { data, missingTable: false }
}

/** 단일 식당 + 통계 (지역 폴백 합류는 useRestaurant 훅에서 처리) */
export async function fetchRestaurantById(
  id: string,
): Promise<RestaurantWithStatsRow | null> {
  // 방문 집계 RPC는 전체(~80행)를 반환 — 단건에서도 그대로 쓰고 해당 행만 고른다.
  const visitStatsPromise = fetchVisitStatsMap()
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

  const visitStats = (await visitStatsPromise).get(id)
  return {
    ...parsed.data,
    rating_count: stats?.rating_count ?? 0,
    avg_score: stats?.avg_score ?? null,
    visits_7d: visitStats?.visits_7d ?? 0,
    visits_total: visitStats?.visits_total ?? 0,
  }
}

/* ──────────────────────────────────────────────────────────
 * 룰렛 (기획서 §8.5) — 2026-10-08부터 RoulettePage가 이미 로드된 목록으로
 * 브라우저 가중 추첨(utils/roulette.ts)을 한다. DB RPC pick_random_restaurant는
 * schema.sql에 보존하되 클라이언트는 호출하지 않는다.
 * ────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────
 * 맛집 등록 (기획서 §8.4)
 * ────────────────────────────────────────────────────────── */

export interface InsertRestaurantResult {
  restaurant: Restaurant
  reviewerId: string
}

/**
 * region 스키마 미적용(구 CHECK '양재','남부터미널' + NOT NULL) 상태에서
 * 동 이름/null을 보내면 나는 제약 위반인지 판별 — 폴백(재시도) 트리거.
 */
function isLegacyRegionError(error: {
  code?: string
  message: string
}): boolean {
  return (
    (error.code === '23514' || error.code === '23502') &&
    error.message.includes('region')
  )
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

  const basePayload = {
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

  // 동 이름 (역지오코딩) — 실패·좌표 없음은 null(미지정, 표시 계층 폴백).
  let { data, error } = await supabase
    .from('restaurants')
    .insert({ ...basePayload, region: input.region })
    .select()
    .single()

  // 구 스키마(region CHECK/NOT NULL) 미적용 상태 폴백 — region 없이 재시도.
  if (error && isLegacyRegionError(error)) {
    console.warn(
      '[restaurants] region 스키마 미적용 — region 없이 등록 폴백.',
      error.message,
    )
    ;({ data, error } = await supabase
      .from('restaurants')
      .insert(basePayload)
      .select()
      .single())
  }

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
  | 'region'
>

export async function updateRestaurant(
  id: string,
  input: UpdateRestaurantInput,
): Promise<Restaurant> {
  // dba 가이드 (task #3 답신):
  // - payload에 `updated_at` 포함 X → BEFORE UPDATE 트리거가 갱신.
  // - payload에 `registered_by` 포함 X → 미명시 컬럼은 기존 값 보존.
  const basePayload = {
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

  let { data, error } = await supabase
    .from('restaurants')
    .update({ ...basePayload, region: input.region })
    .eq('id', id)
    .select()
    .maybeSingle()

  // 구 스키마(region CHECK/NOT NULL) 미적용 상태 폴백 — region 없이 재시도.
  if (error && isLegacyRegionError(error)) {
    console.warn(
      '[restaurants] region 스키마 미적용 — region 없이 수정 폴백.',
      error.message,
    )
    ;({ data, error } = await supabase
      .from('restaurants')
      .update(basePayload)
      .eq('id', id)
      .select()
      .maybeSingle())
  }

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
