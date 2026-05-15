/**
 * iOS 스타일 하단 액션 시트 (목업 §832~887).
 *
 * - 모바일 우선 — 화면 하단에서 슬라이드 업.
 * - 배경 overlay 클릭 / Esc 키로 닫힘.
 * - role="dialog" + aria-modal로 스크린 리더 모달 인지.
 * - 새 npm 의존성 없이 React + Tailwind + CSS keyframes로 구현.
 *
 * 사용:
 *   <ActionSheet
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     items={[
 *       { icon: 'pencil', label: '정보 수정', onSelect: () => ... },
 *       { icon: 'trash', label: '폐업으로 표시', variant: 'danger', onSelect: ... },
 *     ]}
 *   />
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

export interface ActionSheetItem {
  icon?: IconName
  label: string
  onSelect: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  items: ActionSheetItem[]
  cancelLabel?: string
  /** 시트 상단 작은 헤더 텍스트 (선택). 보통 식당명 등. */
  title?: string
}

export function ActionSheet({
  open,
  onClose,
  items,
  cancelLabel = '취소',
  title,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Esc → 닫기, 첫 항목에 포커스, 배경 스크롤 잠금.
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 첫 활성 버튼에 포커스
    const focusTarget = dialogRef.current?.querySelector<HTMLButtonElement>(
      'button:not([disabled])',
    )
    focusTarget?.focus()

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-2 pb-2"
      style={{ animation: 'fadeIn 0.18s ease-out' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '액션 메뉴'}
        className="w-full max-w-md"
        style={{ animation: 'slideUp 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 overflow-hidden rounded-2xl bg-white/95 shadow-lg backdrop-blur">
          {title && (
            <div className="border-b border-surface-border/60 px-4 pb-2 pt-3 text-center text-[11px] text-ink-500">
              {title}
            </div>
          )}
          {items.map((item, idx) => (
            <button
              key={`${item.label}-${idx}`}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return
                item.onSelect()
                onClose()
              }}
              className={[
                'flex w-full items-center gap-2.5 border-b border-surface-border/60 bg-white/90 px-4 py-3.5 text-base font-medium last:border-b-0',
                item.variant === 'danger'
                  ? 'text-brand-danger'
                  : 'text-brand-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'active:bg-surface-muted/70',
              ].join(' ')}
            >
              {item.icon && (
                <span className="inline-flex w-5 justify-center">
                  <Icon name={item.icon} size={18} />
                </span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl bg-white/95 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3.5 text-center text-base font-bold text-brand-primary active:bg-surface-muted/70"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}
