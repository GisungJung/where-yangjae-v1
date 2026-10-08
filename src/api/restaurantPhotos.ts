/**
 * 식당 사진 API (2026-10-07) — 식당당 0~3장, 대표 1장.
 * 설계: doc/plan/features/2026-10-07-restaurant-photos-design.md
 *
 * - 테이블: restaurant_photos (doc/db/schema.sql §2.4b) — 누구나 추가·삭제·대표 변경.
 * - 버킷: restaurant-photos (public, 300KB, JPEG). 원본 1024px + 썸네일 240px.
 *   경로: `<restaurant_id>/<id>.jpg`, `<restaurant_id>/<id>_t.jpg`
 * - 업로드 순서: Storage 먼저 → DB row. row 실패 시 객체 정리
 *   (row가 없는 파일을 가리켜 깨진 <img>가 뜨는 상황을 피한다).
 * - 삭제 순서: DB row 먼저 → Storage remove() best-effort.
 *   (Storage 정리 트리거 없음 — schema.sql §4.4 참고)
 * - 테이블·버킷 미적용 시: 조회는 빈 배열 폴백, 저장은 경고 메시지로 보고.
 */

import { supabase } from '@/lib/supabase'
import { RestaurantPhotoSchema, type RestaurantPhoto } from '@/types/domain'
import {
  resizePhoto,
  shortRandomId,
  type ResizedImage,
} from '@/utils/photoResize'
import { planPhotoSave, type PhotoSlotRef } from '@/utils/restaurantPhotos'

export const RESTAURANT_PHOTO_BUCKET = 'restaurant-photos'
const THUMB_DIMENSION = 240
const CACHE_CONTROL_SECONDS = String(7 * 24 * 60 * 60) // 7일 — egress 절감

/** 업로드 대기 사진 — 원본 + 썸네일 리사이즈 결과. */
export interface PendingRestaurantPhoto {
  full: ResizedImage
  thumb: ResizedImage
}

/** 파일 → 원본(1024px) + 썸네일(240px). 썸네일은 원본 Blob에서 다시 축소. */
export async function prepareRestaurantPhoto(
  file: File,
): Promise<PendingRestaurantPhoto> {
  const full = await resizePhoto(file)
  const thumb = await resizePhoto(full.blob, THUMB_DIMENSION)
  return { full, thumb }
}

/** 전체 식당 사진 (최대 ~240행) — 목록 썸네일용. 테이블 미적용 시 빈 배열. */
export async function fetchAllRestaurantPhotos(): Promise<RestaurantPhoto[]> {
  const { data, error } = await supabase
    .from('restaurant_photos')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingRelation(error.message)) {
      console.warn('[restaurant_photos] 테이블 미적용 — 사진 없이 표시합니다.')
      return []
    }
    throw new Error(`식당 사진을 불러오지 못했어요. (${error.message})`)
  }
  return (data ?? [])
    .map((row) => RestaurantPhotoSchema.safeParse(row))
    .flatMap((r) => (r.success ? [r.data] : []))
}

export function getRestaurantPhotoUrl(path: string): string {
  return supabase.storage.from(RESTAURANT_PHOTO_BUCKET).getPublicUrl(path).data
    .publicUrl
}

async function uploadObject(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(RESTAURANT_PHOTO_BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: CACHE_CONTROL_SECONDS,
      upsert: false,
    })
  if (error) throw new Error(`사진 업로드에 실패했어요. (${error.message})`)
}

async function removeObjects(paths: string[]): Promise<void> {
  const { error } = await supabase.storage
    .from(RESTAURANT_PHOTO_BUCKET)
    .remove(paths)
  if (error) console.warn('[restaurant-photos] 객체 정리 실패 (무시)', error)
}

async function uploadRestaurantPhoto(
  restaurantId: string,
  pending: PendingRestaurantPhoto,
  sortOrder: number,
): Promise<RestaurantPhoto> {
  const base = `${restaurantId}/${shortRandomId()}`
  const storagePath = `${base}.jpg`
  const thumbPath = `${base}_t.jpg`

  await uploadObject(storagePath, pending.full.blob)
  try {
    await uploadObject(thumbPath, pending.thumb.blob)
  } catch (err) {
    await removeObjects([storagePath])
    throw err
  }

  const { data, error } = await supabase
    .from('restaurant_photos')
    .insert({
      restaurant_id: restaurantId,
      storage_path: storagePath,
      thumb_path: thumbPath,
      sort_order: sortOrder,
      byte_size: pending.full.bytes,
      width: pending.full.width,
      height: pending.full.height,
    })
    .select()
    .single()

  if (error) {
    await removeObjects([storagePath, thumbPath])
    if ((error as { code?: string }).code === '23505') {
      throw new Error('다른 사람이 방금 사진을 바꿨어요. 새로고침 후 다시 시도해 주세요.')
    }
    throw new Error(`사진 정보를 저장하지 못했어요. (${error.message})`)
  }
  const parsed = RestaurantPhotoSchema.safeParse(data)
  if (!parsed.success) throw new Error('사진 응답이 올바르지 않습니다.')
  return parsed.data
}

async function deleteRestaurantPhoto(photo: RestaurantPhoto): Promise<void> {
  const { error } = await supabase
    .from('restaurant_photos')
    .delete()
    .eq('id', photo.id)
  if (error) throw new Error(`사진을 삭제하지 못했어요. (${error.message})`)
  await removeObjects([photo.storage_path, photo.thumb_path])
}

/** 대표 지정 — 나머지 해제 후 지정 (부분 유니크 없음, 순서 무관하게 안전). */
async function setCover(restaurantId: string, coverId: string): Promise<void> {
  const { error: offError } = await supabase
    .from('restaurant_photos')
    .update({ is_cover: false })
    .eq('restaurant_id', restaurantId)
    .neq('id', coverId)
  if (offError) throw new Error(`대표 사진 지정 실패 (${offError.message})`)
  const { error: onError } = await supabase
    .from('restaurant_photos')
    .update({ is_cover: true })
    .eq('id', coverId)
  if (onError) throw new Error(`대표 사진 지정 실패 (${onError.message})`)
}

/** 편집기 슬롯 — 기존 사진(savedId) 또는 업로드 대기 사진(pending). */
export interface PhotoSlot extends PhotoSlotRef {
  pending?: PendingRestaurantPhoto
}

/**
 * 편집기 상태를 DB/Storage에 반영. 식당 저장 성공 직후 호출.
 * 부분 실패는 throw하지 않고 경고 메시지(string)로 반환 — 식당 저장 자체는 유지.
 *
 * @returns 경고 메시지 또는 null(전부 성공)
 */
export async function saveRestaurantPhotos(
  restaurantId: string,
  existing: RestaurantPhoto[],
  slots: PhotoSlot[],
  coverKey: string | null,
): Promise<string | null> {
  const plan = planPhotoSave(existing, slots, coverKey)
  const errors: string[] = []

  for (const p of plan.toDelete) {
    try {
      await deleteRestaurantPhoto(p)
    } catch (err) {
      errors.push(errorMessage(err))
    }
  }

  // 슬롯 key → 저장된 photo id (대표 지정용)
  const idByKey = new Map(
    slots.flatMap((s) => (s.savedId ? [[s.key, s.savedId] as const] : [])),
  )
  for (const add of plan.toAdd) {
    const pending = slots.find((s) => s.key === add.key)?.pending
    if (!pending) continue
    try {
      const saved = await uploadRestaurantPhoto(
        restaurantId,
        pending,
        add.sortOrder,
      )
      idByKey.set(add.key, saved.id)
    } catch (err) {
      errors.push(errorMessage(err))
    }
  }

  // 대표 — 지정 대상이 업로드 실패했으면 남은 첫 사진으로 대체.
  const coverId =
    (plan.coverKey && idByKey.get(plan.coverKey)) ??
    slots.map((s) => idByKey.get(s.key)).find(Boolean)
  const coverChanged =
    coverId !== undefined &&
    !existing.some((p) => p.id === coverId && p.is_cover)
  if (coverId && coverChanged) {
    try {
      await setCover(restaurantId, coverId)
    } catch (err) {
      errors.push(errorMessage(err))
    }
  }

  if (errors.length === 0) return null
  return `사진 저장 중 ${errors.length}건 실패: ${errors[0]}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isMissingRelation(message: string): boolean {
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.toLowerCase().includes('not found')
  )
}
