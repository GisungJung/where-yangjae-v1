/**
 * 목업 §306~324의 sort-pill 패턴 (드롭다운).
 *
 * native <select> 대신 버튼 + popup 메뉴 — 모바일에서 작은 폰트와 chevron 한 줄로 표현.
 * 옵션 적은 케이스(3~5개) 전용.
 *
 * 접근성: role="menu" + 키보드 ↑↓Esc 지원, 외부 클릭 닫힘.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export interface SortOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<SortOption<T>>
  ariaLabel?: string
}

export function SortPill<T extends string>({
  value,
  onChange,
  options,
  ariaLabel = '정렬',
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-sm font-medium text-ink-900 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
      >
        <span>{current?.label}</span>
        <Icon name="chevron-down" size={14} className="text-ink-500" />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-surface-border bg-white shadow-lg"
        >
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <li key={opt.value} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={[
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                    active
                      ? 'bg-brand-primary/5 font-semibold text-brand-primary'
                      : 'text-ink-700 hover:bg-surface-muted',
                  ].join(' ')}
                >
                  <span>{opt.label}</span>
                  {active && (
                    <Icon name="check" size={14} className="text-brand-primary" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
