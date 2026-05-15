/**
 * 점심/저녁(저녁회식) sheet_type 토글.
 *
 * 기획서 §6.2: sheet_type ∈ { 'lunch', 'dinner' }.
 * 사내 컨텍스트에서는 점심 / 저녁회식 표기를 쓴다.
 */

import type { SheetType } from '../../types/domain'
import { classNames } from '../../utils/format'

export type SheetTypeFilter = SheetType | 'all'

interface Props {
  value: SheetTypeFilter
  onChange: (next: SheetTypeFilter) => void
  className?: string
}

const OPTIONS: Array<{ value: SheetTypeFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'lunch', label: '점심' },
  { value: 'dinner', label: '저녁회식' },
]

export function SheetTypeToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="식사 시간대"
      className={classNames(
        'inline-flex rounded-full border border-surface-border bg-white p-0.5 text-sm',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={classNames(
              'rounded-full px-3 py-1.5 font-medium transition-colors',
              active
                ? 'bg-brand-primary text-white'
                : 'text-ink-700 hover:bg-surface-muted',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
