import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { insertRating } from '../../api/ratings'
import { uploadRatingPhotosBatch } from '../../api/photos'
import { NewRatingInputSchema } from '../../types/domain'
import { ratingsKeys, useRatings } from '../../hooks/useRatings'
import { restaurantsKeys } from '../../hooks/useRestaurants'
import { useNicknameStore } from '../../store/nicknameStore'
import { StarRating } from './StarRating'
import { PhotoPicker } from './PhotoPicker'
import { Icon } from '../ui/Icon'
import type { ResizedImage } from '../../utils/photoResize'

// 사진 첨부 UI 토글 — 추후 재활성화 시 true로. (PhotoPicker/photos API는 보존)
const ENABLE_PHOTO_UPLOAD = false

interface Props {
  restaurantId: string
}

export function RatingForm({ restaurantId }: Props) {
  const queryClient = useQueryClient()
  const storedNickname = useNicknameStore((s) => s.nickname)
  const storedReviewerId = useNicknameStore((s) => s.reviewerId)
  const setIdentity = useNicknameStore((s) => s.setIdentity)
  const { data: ratings } = useRatings(restaurantId)

  // 이미 본인이 이 식당에 평가했는지 — RLS와 무관하게 UI 힌트용.
  const hasMyRating = Boolean(
    storedReviewerId &&
      ratings?.some((r) => r.reviewer_id === storedReviewerId),
  )

  const [nickname, setNickname] = useState(storedNickname ?? '')
  /** null = 별을 한 번도 선택하지 않은 상태. submit 비활성. */
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  /** PhotoPicker가 알려주는 현재 슬롯의 리사이즈된 이미지(최대 3장). */
  const [photos, setPhotos] = useState<ResizedImage[]>([])
  /** PhotoPicker 강제 리셋용 — 제출 성공 시 key 증가로 0장 복귀. */
  const [photoPickerKey, setPhotoPickerKey] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [photoWarning, setPhotoWarning] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (vars: {
      restaurantId: string
      nickname: string
      score: number
      comment?: string
      photos: ResizedImage[]
    }) => {
      // 1. rating INSERT
      const result = await insertRating({
        restaurantId: vars.restaurantId,
        nickname: vars.nickname,
        score: vars.score,
        comment: vars.comment ?? null,
      })
      // 2. 사진이 있으면 batch upload (best-effort — 평가 자체는 이미 저장됨)
      let photoWarning: string | null = null
      if (vars.photos.length > 0) {
        const batch = await uploadRatingPhotosBatch(result.rating.id, vars.photos)
        if (batch.failures.length > 0) {
          photoWarning = `사진 ${vars.photos.length}장 중 ${batch.failures.length}장 업로드 실패: ${batch.failures[0].error.message}`
        }
      }
      return { ...result, photoWarning }
    },
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({
        queryKey: ratingsKeys.byRestaurant(restaurantId),
      })
      queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
      setIdentity(vars.nickname, res.reviewerId)
      setPhotoWarning(res.photoWarning)
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (score === null) {
      setValidationError('별점을 선택해 주세요.')
      return
    }

    const parsed = NewRatingInputSchema.safeParse({
      nickname: nickname.trim(),
      score,
      comment: comment || undefined,
    })
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      )
      return
    }

    mutation.mutate({
      restaurantId,
      nickname: parsed.data.nickname,
      score: parsed.data.score,
      comment: parsed.data.comment || undefined,
      photos,
    })
  }

  if (mutation.isSuccess) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        <p className="font-medium">평가가 저장되었어요. 고마워요!</p>
        {photoWarning && (
          <p className="mt-2 rounded-input border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {photoWarning}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            mutation.reset()
            setComment('')
            setScore(null)
            setPhotos([])
            setPhotoWarning(null)
            setPhotoPickerKey((k) => k + 1)
            // 닉네임은 store 값으로 유지 — 같은 사람이 다음 평가도 쉽게 작성
            setNickname(storedNickname ?? '')
          }}
          className="mt-2 rounded-button border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          새 평가 작성
        </button>
      </div>
    )
  }

  const mutationError =
    mutation.error instanceof Error
      ? mutation.error.message
      : mutation.error
        ? '평가를 저장하지 못했어요.'
        : null
  const errorMessage = validationError ?? mutationError
  const isSubmitting = mutation.isPending

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-card border border-surface-border bg-white p-4"
      aria-label="평가 작성"
    >
      <div
        role="note"
        className="flex items-start gap-2 rounded-input bg-brand-primary-soft p-3 text-[12px] leading-relaxed text-brand-primary-dark"
      >
        <span className="mt-0.5 shrink-0 text-brand-primary" aria-hidden>
          <Icon name="info" size={14} />
        </span>
        <span>
          {hasMyRating
            ? "이전 평가가 있어요. 위 목록의 '수정' 버튼으로 바로 고칠 수 있고, 추가 평가도 가능해요. (최신 평가가 평균에 반영돼요.)"
            : '별점과 한줄평을 자유롭게 남겨주세요. 마음이 바뀌면 언제든 다시 평가해도 좋아요.'}
        </span>
      </div>

      <div>
        <label
          htmlFor="rating-nickname"
          className="block text-sm font-medium text-ink-700"
        >
          닉네임
        </label>
        <input
          id="rating-nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="off"
          placeholder="닉네임 입력"
          className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700">
          별점 <span className="text-brand-accent">*</span>
        </label>
        <div className="mt-1 flex items-center gap-2">
          <StarRating
            value={score ?? 0}
            onChange={setScore}
            size="lg"
            ariaLabel="별점 입력"
          />
          <span className="text-sm font-semibold text-ink-900">
            {score === null ? '미선택' : `${score.toFixed(1)} / 5.0`}
          </span>
        </div>
      </div>

      <div>
        <label
          htmlFor="rating-comment"
          className="block text-sm font-medium text-ink-700"
        >
          한줄평{' '}
          <span className="text-xs text-ink-500">(선택, 200자 이하)</span>
        </label>
        <textarea
          id="rating-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={200}
          rows={3}
          className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
        <div className="mt-1 text-right text-xs text-ink-500">
          {comment.length} / 200
        </div>
      </div>

      {ENABLE_PHOTO_UPLOAD && (
        <div>
          <span className="block text-sm font-medium text-ink-700">
            사진 <span className="text-xs text-ink-500">(선택, 최대 3장)</span>
          </span>
          <div className="mt-1">
            <PhotoPicker key={photoPickerKey} onChange={setPhotos} />
          </div>
        </div>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || score === null || !nickname.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-button bg-brand-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden
          />
        )}
        {isSubmitting ? '저장 중…' : '평가 제출'}
      </button>
    </form>
  )
}
