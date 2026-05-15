/**
 * 사진 첨부 컴포넌트 (task #12) — RatingForm에 통합되어 평가당 최대 3장.
 *
 * 흐름:
 * 1. <input type="file" accept="image/*" capture="environment"> — 모바일 카메라 우선
 * 2. 선택 즉시 `resizePhoto()` — 1024px / JPEG q=0.8 (q=0.7 폴백) / 300KB 가드
 * 3. ObjectURL로 즉시 프리뷰 + 슬롯에 자리잡기
 * 4. 사용자가 X로 제거 가능, 빈 슬롯에서 다시 선택
 *
 * 실제 업로드는 RatingForm submit 시점에 한꺼번에 (rating INSERT → 사진 batch upload).
 * 이 컴포넌트는 리사이즈된 Blob만 부모에 전달.
 */

import { useEffect, useRef, useState } from 'react'
import {
  resizePhoto,
  UnsupportedImageFormatError,
  OversizedImageError,
  type ResizedImage,
} from '../../utils/photoResize'
import { MAX_PHOTOS_PER_RATING } from '../../api/photos'
import { Icon } from '../ui/Icon'

interface Props {
  /** 부모(RatingForm)에 현재 슬롯 상태 알림. submit 시 업로드용. */
  onChange: (resized: ResizedImage[]) => void
  /** 외부에서 폼 리셋 시 0장으로 되돌릴 수 있게 key 변경으로 재마운트 권장 */
}

interface Slot {
  resized: ResizedImage
  /** 미리보기용 ObjectURL — cleanup 필요 */
  previewUrl: string
}

export function PhotoPicker({ onChange }: Props) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 부모로 ResizedImage[] 전파 — slots 변경 시마다.
  useEffect(() => {
    onChange(slots.map((s) => s.resized))
    // ResizedImage는 안정 참조라 effect 트리거에 onChange 포함 안 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  // ObjectURL 해제 — 언마운트 시.
  useEffect(() => {
    return () => {
      for (const s of slots) URL.revokeObjectURL(s.previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)
    const remaining = MAX_PHOTOS_PER_RATING - slots.length
    const incoming = Array.from(files).slice(0, remaining)
    if (incoming.length === 0) {
      setError(`사진은 최대 ${MAX_PHOTOS_PER_RATING}장까지만 첨부할 수 있어요.`)
      resetInput()
      return
    }

    setBusy(true)
    try {
      const newSlots: Slot[] = []
      for (const f of incoming) {
        try {
          const resized = await resizePhoto(f)
          newSlots.push({
            resized,
            previewUrl: URL.createObjectURL(resized.blob),
          })
        } catch (err) {
          if (err instanceof UnsupportedImageFormatError) {
            setError(err.message)
          } else if (err instanceof OversizedImageError) {
            setError(err.message)
          } else {
            setError(
              err instanceof Error
                ? err.message
                : '사진 처리 중 오류가 발생했어요.',
            )
          }
          // 한 장 실패 시 나머지는 그대로 진행 (UX 친화적).
        }
      }
      if (newSlots.length > 0) {
        setSlots((prev) => [...prev, ...newSlots])
      }
    } finally {
      setBusy(false)
      resetInput()
    }
  }

  const removeAt = (i: number) => {
    setSlots((prev) => {
      const slot = prev[i]
      if (slot) URL.revokeObjectURL(slot.previewUrl)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const canAdd = slots.length < MAX_PHOTOS_PER_RATING

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="list"
        aria-label="첨부 사진 목록"
      >
        {slots.map((s, i) => (
          <figure
            key={s.previewUrl}
            role="listitem"
            className="relative h-20 w-20 overflow-hidden rounded-input border border-surface-border bg-surface-muted"
          >
            <img
              src={s.previewUrl}
              alt={`첨부 ${i + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`첨부 ${i + 1} 제거`}
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <Icon name="x" size={11} />
            </button>
          </figure>
        ))}

        {canAdd && (
          <label
            className={[
              'inline-flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-input border border-dashed border-surface-border bg-white text-[11px] text-ink-500 hover:bg-surface-muted',
              busy ? 'pointer-events-none opacity-60' : '',
            ].join(' ')}
          >
            <Icon name="plus" size={16} />
            <span>{busy ? '처리 중…' : '사진 추가'}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handlePick}
              className="hidden"
            />
          </label>
        )}
      </div>

      <p className="text-[11px] text-ink-500">
        최대 {MAX_PHOTOS_PER_RATING}장 · 1024px / JPEG로 자동 축소 ·{' '}
        {slots.length}/{MAX_PHOTOS_PER_RATING} 사용
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}
