/**
 * 평가 리스트 (닉네임 / 별점 / 코멘트 / 작성일)
 *
 * 본인이 작성한 평가는 nicknameStore.reviewerId 매칭으로 식별되며
 * "수정" / "삭제" 버튼이 노출된다. RLS는 `x-reviewer-id` 헤더로 검증되므로
 * 다른 브라우저에서 같은 닉네임을 흉내내도 헤더가 다르면 0행 반환으로 막힌다.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RatingPhoto, RatingWithReviewer } from '../../types/domain'
import { formatYmd } from '../../utils/format'
import { StarRating } from './StarRating'
import { useNicknameStore } from '../../store/nicknameStore'
import { deleteRating, updateRating } from '../../api/ratings'
import { getPhotoPublicUrl } from '../../api/photos'
import { ratingsKeys } from '../../hooks/useRatings'
import { restaurantsKeys } from '../../hooks/useRestaurants'
import { usePhotosByRestaurant } from '../../hooks/usePhotos'

interface Props {
  ratings: RatingWithReviewer[]
  restaurantId: string
}

export function RatingList({ ratings, restaurantId }: Props) {
  const myReviewerId = useNicknameStore((s) => s.reviewerId)
  // 식당 전체의 사진을 한 번에 batch fetch (마이그레이션 미적용 시 빈 Map 폴백).
  const { data: photosByRating } = usePhotosByRestaurant(restaurantId)

  if (ratings.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-surface-border bg-white p-6 text-center text-sm text-ink-700">
        <p>아직 한줄평이 없어요.</p>
        <p className="mt-1 text-xs text-ink-500">첫 평가를 남겨보세요!</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {ratings.map((rating) => (
        <RatingItem
          key={rating.id}
          rating={rating}
          restaurantId={restaurantId}
          isMine={
            myReviewerId !== null && rating.reviewer_id === myReviewerId
          }
          photos={photosByRating?.get(rating.id) ?? []}
        />
      ))}
    </ul>
  )
}

function RatingItem({
  rating,
  restaurantId,
  isMine,
  photos,
}: {
  rating: RatingWithReviewer
  restaurantId: string
  isMine: boolean
  photos: RatingPhoto[]
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  /** null = 별 미선택. 0.5 미만 점수로 저장하는 사고를 차단한다. */
  const [score, setScore] = useState<number | null>(rating.score)
  const [comment, setComment] = useState(rating.comment ?? '')
  const [err, setErr] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ratingsKeys.byRestaurant(restaurantId),
    })
    queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
  }

  const updateMut = useMutation({
    mutationFn: () => {
      if (score === null || score < 0.5) {
        return Promise.reject(new Error('별점은 최소 0.5점이어야 해요.'))
      }
      return updateRating({
        ratingId: rating.id,
        score,
        comment: comment.trim() ? comment.trim() : null,
      })
    },
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : '수정 실패'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteRating(rating.id),
    onSuccess: () => invalidate(),
    onError: (e) => setErr(e instanceof Error ? e.message : '삭제 실패'),
  })

  const startEdit = () => {
    setErr(null)
    setScore(rating.score)
    setComment(rating.comment ?? '')
    setEditing(true)
  }

  const requestDelete = () => {
    setErr(null)
    if (typeof window !== 'undefined') {
      const ok = window.confirm('이 평가를 삭제할까요?')
      if (!ok) return
    }
    deleteMut.mutate()
  }

  return (
    <li className="rounded-card border border-surface-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">
            {rating.reviewer.nickname}
          </span>
          {!editing && (
            <>
              <StarRating readOnly value={rating.score} size="sm" />
              <span className="text-sm font-semibold text-brand-warn">
                {rating.score.toFixed(1)}
              </span>
            </>
          )}
        </div>
        <time className="text-xs text-ink-500">
          {formatYmd(rating.created_at)}
        </time>
      </div>

      {!editing && rating.comment && (
        <p className="mt-2 whitespace-pre-line text-sm text-ink-700">
          {rating.comment}
        </p>
      )}

      {!editing && photos.length > 0 && (
        <RatingPhotosStrip photos={photos} reviewerName={rating.reviewer.nickname} />
      )}

      {editing && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <StarRating
              value={score ?? 0}
              onChange={setScore}
              size="md"
              ariaLabel="별점 수정"
            />
            <span className="text-sm font-semibold text-ink-900">
              {score === null ? '미선택' : `${score.toFixed(1)} / 5.0`}
            </span>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="한줄평 (선택, 200자 이하)"
            className="w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
          <div className="text-right text-xs text-ink-500">
            {comment.length} / 200
          </div>
        </div>
      )}

      {err && (
        <p
          role="alert"
          className="mt-2 rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {err}
        </p>
      )}

      {isMine && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          {!editing && (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-button border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                수정
              </button>
              <button
                type="button"
                onClick={requestDelete}
                disabled={deleteMut.isPending}
                className="rounded-button border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {deleteMut.isPending ? '삭제 중…' : '삭제'}
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-button border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => updateMut.mutate()}
                disabled={
                  updateMut.isPending || score === null || score < 0.5
                }
                className="rounded-button bg-brand-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
              >
                {updateMut.isPending ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * 평가에 딸린 사진을 가로 strip으로 표시. dba 권고대로:
 * - 첫 장은 eager (LCP 후보 고려해도 작은 썸네일이라 부담 없음)
 * - 나머지는 native `loading="lazy" decoding="async"` 위임 (스크롤·swipe 시 자연 로드)
 * - 클릭 시 새 탭에서 원본 열기 — 라이트박스는 v2에서 (의존성 추가 회피)
 *
 * 향후 carousel/lightbox 도입 시 본 컴포넌트만 교체하면 됨.
 */
function RatingPhotosStrip({
  photos,
  reviewerName,
}: {
  photos: RatingPhoto[]
  reviewerName: string
}) {
  return (
    <div
      className="mt-2 -mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1"
      role="list"
      aria-label={`${reviewerName}의 첨부 사진`}
    >
      {photos.map((p, i) => {
        const url = getPhotoPublicUrl(p.storage_path)
        return (
          <a
            key={p.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            role="listitem"
            className="block shrink-0 overflow-hidden rounded-input border border-surface-border bg-surface-muted"
            style={{ width: 96, height: 96 }}
          >
            <img
              src={url}
              alt={`${reviewerName} 첨부 ${i + 1}`}
              width={p.width ?? undefined}
              height={p.height ?? undefined}
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </a>
        )
      })}
    </div>
  )
}
