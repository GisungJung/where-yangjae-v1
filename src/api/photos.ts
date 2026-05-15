/**
 * 평가 사진 API (task #12)
 *
 * dba C-3 패턴 (`supabase/migrations/20260515000002_rating_photos_and_storage.sql`):
 *   1. 클라에서 `shortRandomId()` 로 `${ratingId}/${id}.jpg` 경로 결정
 *   2. `INSERT INTO rating_photos (...)` — DB row 먼저
 *   3. `storage.upload(path, blob, { cacheControl: '604800', upsert: false })`
 *   4. (3) 실패 시 `DELETE FROM rating_photos WHERE id=...` — orphan은 객체-only(빈 <img>) 보다 DB-only가 안전
 *
 * Storage:
 * - 버킷: `rating-photos` (public, 300KB, image/jpeg + image/webp만 허용)
 * - Egress 절감: `cacheControl: '604800'` (7일) 필수
 *
 * RLS:
 * - `rating_photos_insert_own` — 본인 rating에만 INSERT (헤더 매칭)
 * - `storage.objects` insert: regex `^<uuid>/[^/]+$` — 경로 prefix가 UUID
 * - 모든 SELECT는 public
 *
 * 평가 삭제 시 CASCADE 트리거가 rating_photos + storage 객체 자동 정리 — 클라 무관.
 */

import { supabase } from '../lib/supabase'
import { RatingPhotoSchema, type RatingPhoto } from '../types/domain'
import {
  resizePhoto,
  shortRandomId,
  type ResizedImage,
} from '../utils/photoResize'

export const STORAGE_BUCKET = 'rating-photos'
export const MAX_PHOTOS_PER_RATING = 3
const CACHE_CONTROL_SECONDS = 7 * 24 * 60 * 60 // 604800

export interface UploadRatingPhotoInput {
  ratingId: string
  resized: ResizedImage
  sortOrder: number
}

/**
 * C-3 패턴 업로드. DB row 먼저, Storage 업로드 다음, 실패 시 row 롤백.
 *
 * @returns DB에 등록된 RatingPhoto (storage_path 포함)
 */
export async function uploadRatingPhoto(
  input: UploadRatingPhotoInput,
): Promise<RatingPhoto> {
  const { ratingId, resized, sortOrder } = input
  const storagePath = `${ratingId}/${shortRandomId()}.jpg`

  // 1. DB row — RLS가 본인 rating 인지 검증.
  const { data: row, error: insertError } = await supabase
    .from('rating_photos')
    .insert({
      rating_id: ratingId,
      storage_path: storagePath,
      sort_order: sortOrder,
      byte_size: resized.bytes,
      width: resized.width,
      height: resized.height,
    })
    .select()
    .single()

  if (insertError) {
    // RLS 위반(타인 평가에 첨부) 또는 UNIQUE(rating_id, sort_order) 충돌.
    const code = (insertError as { code?: string }).code
    if (code === '23505') {
      throw new Error('같은 자리에 이미 사진이 있어요. 새로고침 후 다시 시도해 주세요.')
    }
    throw new Error(`사진 정보를 저장하지 못했어요. (${insertError.message})`)
  }

  const parsed = RatingPhotoSchema.safeParse(row)
  if (!parsed.success) {
    throw new Error('사진 응답이 올바르지 않습니다.')
  }

  // 2. Storage 업로드.
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, resized.blob, {
      contentType: 'image/jpeg',
      cacheControl: String(CACHE_CONTROL_SECONDS),
      upsert: false,
    })

  if (uploadError) {
    // 3. 실패 시 DB row 롤백 — 표시상 빈 <img>가 남는 것보다 일관 무로 만듦.
    await supabase
      .from('rating_photos')
      .delete()
      .eq('id', parsed.data.id)
      // best-effort, 결과는 사용자 흐름에 영향 없음
      .then(() => undefined)
    throw new Error(`사진 업로드에 실패했어요. (${uploadError.message})`)
  }

  return parsed.data
}

/**
 * 식당의 전체 평가에 딸린 사진을 한 번에 조회 — N+1 회피.
 *
 * PostgREST embedded resource로 `ratings.restaurant_id` 필터. 마이그레이션
 * 미적용 시 빈 Map 반환 (RatingList가 사진 영역 자동 비표시).
 */
export async function listPhotosByRestaurant(
  restaurantId: string,
): Promise<Map<string, RatingPhoto[]>> {
  const { data, error } = await supabase
    .from('rating_photos')
    .select('*, ratings!inner(restaurant_id)')
    .eq('ratings.restaurant_id', restaurantId)
    .order('rating_id', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingRelation(error.message)) return new Map()
    throw new Error(`사진 목록을 불러오지 못했어요. (${error.message})`)
  }

  const byRating = new Map<string, RatingPhoto[]>()
  for (const row of data ?? []) {
    const parsed = RatingPhotoSchema.safeParse(row)
    if (!parsed.success) continue
    const arr = byRating.get(parsed.data.rating_id) ?? []
    arr.push(parsed.data)
    byRating.set(parsed.data.rating_id, arr)
  }
  return byRating
}

/**
 * 평가에 딸린 사진 목록 — sort_order 오름차순.
 */
export async function listPhotosByRating(
  ratingId: string,
): Promise<RatingPhoto[]> {
  const { data, error } = await supabase
    .from('rating_photos')
    .select('*')
    .eq('rating_id', ratingId)
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingRelation(error.message)) {
      // 마이그레이션 미적용 — 빈 배열로 폴백.
      return []
    }
    throw new Error(`사진 목록을 불러오지 못했어요. (${error.message})`)
  }

  return (data ?? [])
    .map((row) => RatingPhotoSchema.safeParse(row))
    .flatMap((r) => (r.success ? [r.data] : []))
}

/**
 * 본인 평가의 사진 1장 삭제. CASCADE 트리거가 Storage 객체까지 정리.
 *
 * RLS `rating_photos_delete_own` 이 본인 평가만 통과시키므로 다른 사용자 사진엔
 * 0행 반환(에러 아님). UI는 0행 = 권한 없음 메시지로 변환.
 */
export async function deleteRatingPhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase
    .from('rating_photos')
    .delete()
    .eq('id', photoId)
    .select()

  if (error) {
    throw new Error(`사진을 삭제하지 못했어요. (${error.message})`)
  }
  if (!data || data.length === 0) {
    throw new Error('내 사진만 삭제할 수 있어요.')
  }
}

/**
 * 공개 URL 생성 (버킷이 public이라 CDN으로 직접 노출). 만료 없음.
 */
export function getPhotoPublicUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath)
  return data.publicUrl
}

/**
 * 폼 단에서 사용자가 선택한 파일들을 리사이즈하고 업로드까지 일괄 처리.
 *
 * 호출자가 ratingId를 알아야 하므로 RatingForm.tsx에서 rating INSERT 직후 호출.
 *
 * 부분 실패 처리:
 * - 한 장 실패 시 나머지는 그대로 진행 → 최종 결과에 실패한 인덱스만 반환.
 * - 호출부에서 사용자에게 "X장 중 Y장 업로드 실패" 안내 가능.
 */
export interface BatchUploadResult {
  successes: RatingPhoto[]
  failures: { index: number; error: Error }[]
}

export async function uploadRatingPhotosBatch(
  ratingId: string,
  resizedItems: ResizedImage[],
): Promise<BatchUploadResult> {
  const successes: RatingPhoto[] = []
  const failures: { index: number; error: Error }[] = []

  // 직렬 처리 — 동일 sort_order 충돌 회피 + Storage 동시 요청 부하 감소.
  for (let i = 0; i < resizedItems.length; i++) {
    try {
      const photo = await uploadRatingPhoto({
        ratingId,
        resized: resizedItems[i],
        sortOrder: i,
      })
      successes.push(photo)
    } catch (err) {
      failures.push({
        index: i,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  return { successes, failures }
}

/**
 * 사용자가 PhotoPicker에서 추가한 File을 리사이즈만 미리 수행 (업로드 전 단계).
 * RatingForm은 submit 시점에 이 ResizedImage 배열을 받아 `uploadRatingPhotosBatch`에 넘김.
 */
export async function prepareRatingPhotos(files: File[]): Promise<ResizedImage[]> {
  if (files.length > MAX_PHOTOS_PER_RATING) {
    throw new Error(`사진은 최대 ${MAX_PHOTOS_PER_RATING}장까지만 첨부할 수 있어요.`)
  }
  const out: ResizedImage[] = []
  for (const f of files) {
    out.push(await resizePhoto(f))
  }
  return out
}

function isMissingRelation(message: string): boolean {
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.toLowerCase().includes('not found')
  )
}
