/**
 * 식당 사진 편집기 (2026-10-07) — 등록·수정 폼 공용. 최대 3장, 대표 1장.
 * 설계: doc/plan/features/2026-10-07-restaurant-photos-design.md §2
 *
 * - 제어 컴포넌트: 슬롯 목록과 대표 key는 부모(폼)가 소유하고, 실제 저장은
 *   폼 제출 시 `saveRestaurantPhotos()`가 한꺼번에 반영한다.
 * - 슬롯: 기존 사진(savedId + 원격 썸네일) 또는 신규(pending + ObjectURL 미리보기).
 * - ★ 버튼으로 대표 지정. 대표가 빠지면 부모가 첫 슬롯으로 넘기도록
 *   planPhotoSave가 보정한다 (화면 표시도 동일 규칙).
 */

import { useEffect, useRef, useState } from 'react'
import {
  prepareRestaurantPhoto,
  type PhotoSlot,
} from '../../api/restaurantPhotos'
import { MAX_PHOTOS_PER_RESTAURANT } from '../../utils/restaurantPhotos'
import { shortRandomId } from '../../utils/photoResize'
import { Icon } from '../ui/Icon'

/** 편집기 슬롯 — 미리보기 URL 포함 */
export interface EditorPhotoSlot extends PhotoSlot {
  previewUrl: string
}

interface Props {
  slots: EditorPhotoSlot[]
  coverKey: string | null
  onChange: (slots: EditorPhotoSlot[], coverKey: string | null) => void
}

export function RestaurantPhotoEditor({ slots, coverKey, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 신규 슬롯 ObjectURL 해제 — 언마운트 시 (최신 슬롯 기준).
  const slotsRef = useRef(slots)
  useEffect(() => {
    slotsRef.current = slots
  }, [slots])
  useEffect(() => {
    return () => {
      for (const s of slotsRef.current) {
        if (s.pending) URL.revokeObjectURL(s.previewUrl)
      }
    }
  }, [])

  // 대표 표시 — 지정 key가 없으면 첫 슬롯 (planPhotoSave와 동일 규칙)
  const effectiveCover =
    coverKey && slots.some((s) => s.key === coverKey)
      ? coverKey
      : (slots[0]?.key ?? null)

  const handlePick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)
    const remaining = MAX_PHOTOS_PER_RESTAURANT - slots.length
    const incoming = Array.from(files).slice(0, remaining)
    if (files.length > remaining) {
      setError(`사진은 최대 ${MAX_PHOTOS_PER_RESTAURANT}장까지 올릴 수 있어요.`)
    }

    setBusy(true)
    const added: EditorPhotoSlot[] = []
    try {
      for (const f of incoming) {
        try {
          const pending = await prepareRestaurantPhoto(f)
          added.push({
            key: shortRandomId(),
            pending,
            previewUrl: URL.createObjectURL(pending.thumb.blob),
          })
        } catch (err) {
          setError(err instanceof Error ? err.message : '사진 처리 중 오류가 발생했어요.')
        }
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
    if (added.length > 0) {
      onChange([...slots, ...added], coverKey ?? added[0].key)
    }
  }

  const removeAt = (key: string) => {
    const target = slots.find((s) => s.key === key)
    if (target?.pending) URL.revokeObjectURL(target.previewUrl)
    onChange(
      slots.filter((s) => s.key !== key),
      coverKey === key ? null : coverKey,
    )
  }

  const canAdd = slots.length < MAX_PHOTOS_PER_RESTAURANT

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="list" aria-label="식당 사진">
        {slots.map((s, i) => {
          const isCover = s.key === effectiveCover
          return (
            <figure
              key={s.key}
              role="listitem"
              className={[
                'relative h-24 w-24 overflow-hidden rounded-input border bg-surface-muted',
                isCover
                  ? 'border-brand-accent ring-2 ring-brand-accent/40'
                  : 'border-surface-border',
              ].join(' ')}
            >
              <img
                src={s.previewUrl}
                alt={`식당 사진 ${i + 1}`}
                className="h-full w-full object-cover"
                decoding="async"
              />
              <button
                type="button"
                onClick={() => onChange(slots, s.key)}
                aria-pressed={isCover}
                aria-label={isCover ? '대표 사진' : `사진 ${i + 1}을 대표로 지정`}
                className={[
                  'absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  isCover
                    ? 'bg-brand-accent text-white'
                    : 'bg-black/55 text-white hover:bg-black/75',
                ].join(' ')}
              >
                ★{isCover ? ' 대표' : ''}
              </button>
              <button
                type="button"
                onClick={() => removeAt(s.key)}
                aria-label={`사진 ${i + 1} 제거`}
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <Icon name="x" size={11} />
              </button>
            </figure>
          )
        })}

        {canAdd && (
          <label
            className={[
              'inline-flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-input border border-dashed border-surface-border bg-white text-[11px] text-ink-500 hover:bg-surface-muted',
              busy ? 'pointer-events-none opacity-60' : '',
            ].join(' ')}
          >
            <Icon name="plus" size={16} />
            <span>{busy ? '처리 중…' : '사진 추가'}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePick}
              className="hidden"
            />
          </label>
        )}
      </div>

      <p className="text-[11px] text-ink-500">
        최대 {MAX_PHOTOS_PER_RESTAURANT}장 · ★를 눌러 목록에 보일 대표 사진을
        고르세요 · {slots.length}/{MAX_PHOTOS_PER_RESTAURANT}
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
