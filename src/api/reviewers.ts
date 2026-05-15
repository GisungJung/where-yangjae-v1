import { supabase } from '../lib/supabase'
import { getCurrentReviewerId } from '../store/nicknameStore'
import { ReviewerSchema, type Reviewer } from '../types/domain'

/**
 * 본인 식별(reviewer_id) 확보.
 *
 * 동작:
 * 1. localStorage에 reviewer_id가 있으면 그 row를 SELECT로 검증해 반환 (재사용).
 *    닉네임이 바뀌었으면 best-effort UPDATE.
 * 2. 없으면 새 row를 INSERT 후 반환.
 *
 * 닉네임은 더 이상 "사용자 식별 키"가 아님 — 단순한 표시 라벨. 같은 닉네임이
 * 서로 다른 reviewer_id를 갖는 케이스를 허용한다(task #18 마이그레이션으로 UNIQUE 제거).
 *
 * 기존 호출자(`insertRating`/`insertRestaurant`)는 `upsertReviewerByNickname` 이름을
 * 그대로 import해서 사용하므로 동일 시그니처로 export.
 */
export async function upsertReviewerByNickname(
  nickname: string,
): Promise<Reviewer> {
  const trimmed = nickname.trim()
  if (!trimmed) {
    throw new Error('닉네임이 비어 있습니다.')
  }

  // 1. 본인의 영속 식별자가 있으면 우선 사용. 새 row 만들지 않음.
  const storedId = getCurrentReviewerId()
  if (storedId) {
    const { data: own } = await supabase
      .from('reviewers')
      .select('*')
      .eq('id', storedId)
      .maybeSingle()
    if (own) {
      const parsed = ReviewerSchema.safeParse(own)
      if (parsed.success) {
        // 닉네임이 바뀌었으면 best-effort UPDATE (자유 변경 정책).
        // RLS 차단 시 실패 → 무시하고 기존 row 반환.
        if (parsed.data.nickname !== trimmed) {
          try {
            const updated = await updateReviewerNickname(parsed.data.id, trimmed)
            return updated
          } catch {
            /* swallow — 본 평가/등록 흐름은 진행 */
          }
        }
        return parsed.data
      }
    }
    // localStorage id가 DB에서 사라진 경우(시드 재적용 등) → 폴스루로 새 INSERT.
  }

  // 2. 신규 INSERT.
  const { data: inserted, error } = await supabase
    .from('reviewers')
    .insert({ nickname: trimmed })
    .select()
    .single()

  if (error) {
    throw new Error(
      `닉네임 등록에 실패했어요. (${error.message})`,
    )
  }
  const parsed = ReviewerSchema.safeParse(inserted)
  if (!parsed.success) {
    throw new Error('닉네임 응답이 올바르지 않습니다.')
  }
  return parsed.data
}

/**
 * 본인 닉네임 변경 — task #19.
 *
 * RLS `reviewers_update_own` (task #18 적용 대기) 가 본인 row만 허용.
 * 미적용 상태에선 RESTRICTIVE `reviewers_update_block` 이 차단해 에러 반환.
 * 호출부에서 사용자 친화 메시지로 변환할 것.
 */
export async function updateReviewerNickname(
  id: string,
  nickname: string,
): Promise<Reviewer> {
  const trimmed = nickname.trim()
  if (!trimmed) {
    throw new Error('닉네임이 비어 있습니다.')
  }
  if (trimmed.length > 20) {
    throw new Error('닉네임은 20자 이하여야 합니다.')
  }

  const { data, error } = await supabase
    .from('reviewers')
    .update({ nickname: trimmed })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`닉네임을 변경하지 못했어요. (${error.message})`)
  }
  if (!data) {
    // RLS 차단 시 0행 (USING(false)) 또는 id 부재.
    throw new Error(
      '닉네임 변경 권한이 없어요. (마이그레이션 적용 대기 중일 수 있어요.)',
    )
  }
  const parsed = ReviewerSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('닉네임 변경 응답이 올바르지 않습니다.')
  }
  return parsed.data
}
