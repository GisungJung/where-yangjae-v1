/**
 * iOS 스타일 중앙 alert 다이얼로그 (목업 §889~946).
 *
 * - 280px 폭 카드, backdrop-blur, 가로 2버튼.
 * - role="dialog" + aria-modal, Esc 닫기, 첫 포커스는 안전한 취소 버튼.
 * - 위험한 액션은 `danger={true}` — 우측 버튼이 danger 컬러로 강조.
 *
 * 사용:
 *   <ConfirmDialog
 *     open={open}
 *     title="폐업 처리할까요?"
 *     message={<><strong>미진면옥</strong>을 폐업 처리합니다. 평가 12건은 보존돼요.</>}
 *     confirmLabel="폐업 처리"
 *     cancelLabel="취소"
 *     danger
 *     onConfirm={() => mutate()}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

interface Props {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** 위험한 액션 — 확인 버튼이 빨간색으로 강조됨. */
  danger?: boolean
  /** 상단 아이콘 (선택). 보통 trash·alert 등. */
  icon?: IconName
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  danger = false,
  icon,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      // 간단한 focus trap — Tab만 처리
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 위험 액션이라도 기본 포커스는 안전한 cancel
    cancelBtnRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      style={{ animation: 'dlgFade 0.18s ease-out' }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-desc' : undefined}
        className="w-[280px] overflow-hidden rounded-2xl bg-white/95 shadow-2xl backdrop-blur-md"
        style={{ animation: 'dlgPop 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && (
          <div
            className={`mx-auto mt-5 flex h-9 w-9 items-center justify-center ${
              danger ? 'text-brand-danger' : 'text-brand-primary'
            }`}
            aria-hidden
          >
            <Icon name={icon} size={32} />
          </div>
        )}
        <h2
          id="confirm-title"
          className="px-5 pb-1.5 pt-5 text-center text-[17px] font-bold text-ink-900"
          style={icon ? { paddingTop: '0.5rem' } : undefined}
        >
          {title}
        </h2>
        {message && (
          <div
            id="confirm-desc"
            className="px-5 pb-4 text-center text-[13px] leading-relaxed text-ink-700"
          >
            {message}
          </div>
        )}
        <div className="flex border-t border-surface-border/70">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 text-base font-medium text-brand-primary active:bg-surface-muted/60"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-surface-border/70" aria-hidden />
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3 text-base font-bold active:bg-surface-muted/60 ${
              danger ? 'text-brand-danger' : 'text-brand-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}
