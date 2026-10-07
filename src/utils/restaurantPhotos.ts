/**
 * 식당 사진 규칙 (2026-10-07) — 대표 선택·저장 계획 순수 함수.
 * 설계: doc/plan/features/2026-10-07-restaurant-photos-design.md §3
 */

import type { RestaurantPhoto } from '../types/domain'

export const MAX_PHOTOS_PER_RESTAURANT = 3

/** 대표 사진 — is_cover 행 우선, 없으면 sort_order 최소 행. */
export function pickCover(photos: RestaurantPhoto[]): RestaurantPhoto | null {
  if (photos.length === 0) return null
  const flagged = photos.find((p) => p.is_cover)
  if (flagged) return flagged
  return photos.reduce((min, p) => (p.sort_order < min.sort_order ? p : min))
}

/** 전체 사진을 식당별로 묶는다 (sort_order 오름차순). */
export function groupPhotosByRestaurant(
  photos: RestaurantPhoto[],
): Map<string, RestaurantPhoto[]> {
  const map = new Map<string, RestaurantPhoto[]>()
  for (const p of photos) {
    const arr = map.get(p.restaurant_id) ?? []
    arr.push(p)
    map.set(p.restaurant_id, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order)
  return map
}

/** 편집기 슬롯 — savedId가 있으면 기존 사진, 없으면 업로드 대기 신규 사진. */
export interface PhotoSlotRef {
  key: string
  savedId?: string
}

export interface PhotoSavePlan {
  /** 편집기에서 빠진 기존 사진 */
  toDelete: RestaurantPhoto[]
  /** 업로드할 신규 사진 + 배정된 빈 sort_order */
  toAdd: { key: string; sortOrder: number }[]
  /** 저장 후 대표가 될 슬롯 key (없으면 null) */
  coverKey: string | null
}

/**
 * 기존 사진(existing)과 편집기 슬롯(slots)을 비교해 저장 계획을 만든다.
 * 신규 사진은 남아있는 기존 사진이 쓰지 않는 sort_order(0~2)에 순서대로 배정
 * — DB UNIQUE(restaurant_id, sort_order)·CHECK(0~2)와 정합.
 */
export function planPhotoSave(
  existing: RestaurantPhoto[],
  slots: PhotoSlotRef[],
  coverKey: string | null,
): PhotoSavePlan {
  const keptIds = new Set(slots.flatMap((s) => (s.savedId ? [s.savedId] : [])))
  const toDelete = existing.filter((p) => !keptIds.has(p.id))
  const usedOrders = new Set(
    existing.filter((p) => keptIds.has(p.id)).map((p) => p.sort_order),
  )
  const freeOrders = Array.from(
    { length: MAX_PHOTOS_PER_RESTAURANT },
    (_, i) => i,
  ).filter((i) => !usedOrders.has(i))

  const toAdd: PhotoSavePlan['toAdd'] = []
  for (const s of slots) {
    if (s.savedId) continue
    const order = freeOrders.shift()
    if (order === undefined) break
    toAdd.push({ key: s.key, sortOrder: order })
  }

  const validKeys = new Set([
    ...slots.filter((s) => s.savedId).map((s) => s.key),
    ...toAdd.map((a) => a.key),
  ])
  const cover =
    coverKey && validKeys.has(coverKey)
      ? coverKey
      : (slots.find((s) => validKeys.has(s.key))?.key ?? null)

  return { toDelete, toAdd, coverKey: cover }
}
