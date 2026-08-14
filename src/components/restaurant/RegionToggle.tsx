/**
 * 지역(양재/남부터미널) 토글 — 2026-08-12 지역 확대.
 *
 * SheetTypeToggle과 동일한 pill 패턴. 설계:
 * doc/plan/2026-08-12-region-split-design.md §3.
 */

import { REGIONS, type Region } from '../../types/domain'
import { classNames } from '../../utils/format'

export type RegionFilter = Region | 'all'

interface Props {
  value: RegionFilter
  onChange: (next: RegionFilter) => void
  className?: string
}

const OPTIONS: Array<{ value: RegionFilter; label: string }> = [
  { value: 'all', label: '전체' },
  ...REGIONS.map((r) => ({ value: r as RegionFilter, label: r })),
]

export function RegionToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="지역"
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
