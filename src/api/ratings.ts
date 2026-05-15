/**
 * 평가(ratings) 관련 Supabase 쿼리.
 *
 * - 단일 식당의 평가 + 닉네임을 한 번에 가져오기 위해 PostgREST의 join 문법 사용.
 * - 평가 작성은 reviewer upsert → ratings INSERT 두 단계.
 * - 1인 N평가 허용(task #8 마이그레이션 후). 분당 1회·시간당 10회 rate-limit 트리거가
 *   ERRCODE 54000으로 차단; 메시지는 트리거 측에서 사용자 친화적으로 제공.
 */

import { supabase } from '../lib/supabase'
import { upsertReviewerByNickname } from './reviewers'
import {
  RatingWithReviewerSchema,
  type Rating,
  type RatingWithReviewer,
} from '../types/domain'

/** 특정 식당의 평가 + 닉네임 조인 목록. */
export async function fetchRatingsByRestaurant(
  restaurantId: string,
): Promise<RatingWithReviewer[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select(
      `
      id,
      restaurant_id,
      reviewer_id,
      score,
      comment,
      created_at,
      updated_at,
      reviewer:reviewers!inner ( id, nickname )
    `,
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRelation(error.message)) {
      console.warn(
        '[ratings] 테이블 미생성 — 빈 배열 반환 (dba 마이그레이션 대기).',
      )
      return []
    }
    throw error
  }

  const rows = (data ?? []).map((row) => {
    // PostgREST는 단일 FK 조인이라도 배열로 줄 수 있으므로 정규화
    const r = row as unknown as Record<string, unknown> & {
      reviewer: unknown
    }
    const reviewer = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer
    return { ...r, reviewer }
  })

  return rows
    .map((row) => RatingWithReviewerSchema.safeParse(row))
    .flatMap((r) => (r.success ? [r.data] : []))
}

export interface InsertRatingInput {
  restaurantId: string
  nickname: string
  score: number
  comment?: string | null
}

export interface InsertRatingResult {
  rating: Rating
  reviewerId: string
}

/**
 * 평가 작성: 닉네임 upsert → ratings INSERT.
 *
 * - score는 0~5, 0.5 단위 (UI에서 1차 검증; DB CHECK가 2차 검증).
 * - comment는 200자 이하. 빈 문자열은 null로 저장.
 * - 1인 N평가 허용 (task #8 마이그레이션 후 UNIQUE 제거됨).
 *   동일 사용자 N번째 평가는 `restaurant_stats` 뷰가 최신 1건만 평균에 반영하므로
 *   "사실상 수정"으로 동작 (도배에 의한 평균 왜곡은 차단).
 * - 분당 1회·시간당 10회 rate-limit 트리거가 ERRCODE 54000으로 차단 (task #8).
 *   트리거 메시지가 이미 사용자 친화적이라 그대로 throw.
 */
export async function insertRating(
  input: InsertRatingInput,
): Promise<InsertRatingResult> {
  const score = input.score
  if (
    !Number.isFinite(score) ||
    score < 0.5 ||
    score > 5 ||
    Math.round(score * 2) !== score * 2
  ) {
    throw new Error('별점은 0.5~5점, 0.5 단위로 선택해 주세요.')
  }
  const comment = input.comment?.trim() ? input.comment.trim() : null
  if (comment && comment.length > 200) {
    throw new Error('한줄평은 200자 이하여야 합니다.')
  }

  const reviewer = await upsertReviewerByNickname(input.nickname)

  const { data, error } = await supabase
    .from('ratings')
    .insert({
      restaurant_id: input.restaurantId,
      reviewer_id: reviewer.id,
      score,
      comment,
    })
    .select()
    .single()

  if (error) {
    const code = (error as { code?: string }).code
    // task #8 rate-limit 트리거 — 분당 1회·시간당 10회 초과.
    // 트리거 메시지가 이미 친절(예: "잠시 후 다시 시도해 주세요. ...")이므로 그대로 노출.
    if (code === '54000') {
      throw new Error(error.message)
    }
    throw new Error(`평가를 저장할 수 없어요. (${error.message})`)
  }

  return { rating: data as Rating, reviewerId: reviewer.id }
}

export interface UpdateRatingInput {
  ratingId: string
  score: number
  comment?: string | null
}

/**
 * 평가 수정.
 * RLS `ratings_update_own`이 `x-reviewer-id` 헤더와 reviewer_id를 대조한다.
 * → 헤더는 supabase.ts의 fetch 래퍼가 nicknameStore에서 주입.
 *
 * 정책 통과에 실패하면 PostgREST는 에러가 아니라 0행을 반환하므로
 * `.select().single()` 결과가 null이면 "권한 없음"으로 변환한다.
 */
export async function updateRating(input: UpdateRatingInput): Promise<Rating> {
  const score = input.score
  if (
    !Number.isFinite(score) ||
    score < 0.5 ||
    score > 5 ||
    Math.round(score * 2) !== score * 2
  ) {
    throw new Error('별점은 0.5~5점, 0.5 단위로 선택해 주세요.')
  }
  const comment = input.comment?.trim() ? input.comment.trim() : null
  if (comment && comment.length > 200) {
    throw new Error('한줄평은 200자 이하여야 합니다.')
  }

  const { data, error } = await supabase
    .from('ratings')
    .update({ score, comment })
    .eq('id', input.ratingId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`평가를 수정하지 못했어요. (${error.message})`)
  }
  if (!data) {
    throw new Error(
      '평가를 수정할 권한이 없어요. 본인이 작성한 평가만 수정할 수 있어요.',
    )
  }
  return data as Rating
}

/**
 * 평가 삭제.
 * 권한 흐름은 updateRating과 동일.
 * DELETE는 `.select()`를 함께 호출해 RLS 통과 여부를 행 반환 여부로 확인한다.
 */
export async function deleteRating(ratingId: string): Promise<void> {
  const { data, error } = await supabase
    .from('ratings')
    .delete()
    .eq('id', ratingId)
    .select()

  if (error) {
    throw new Error(`평가를 삭제하지 못했어요. (${error.message})`)
  }
  if (!data || data.length === 0) {
    throw new Error(
      '평가를 삭제할 권한이 없어요. 본인이 작성한 평가만 삭제할 수 있어요.',
    )
  }
}

function isMissingRelation(message: string): boolean {
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.toLowerCase().includes('not found')
  )
}
