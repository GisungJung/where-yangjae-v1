/**
 * 카테고리 chip — 필터/표시 양쪽에 사용.
 *
 * - `selected`가 boolean이면 토글 버튼처럼 동작 (필터).
 * - `selected`가 없으면 정적 배지로 표시 (카드 메타 정보).
 */

import { classNames } from '../../utils/format'

interface CategoryChipProps {
  label: string
  selected?: boolean
  onClick?: () => void
  className?: string
}

export function CategoryChip({
  label,
  selected,
  onClick,
  className,
}: CategoryChipProps) {
  const isInteractive = typeof onClick === 'function'
  const isSelected = Boolean(selected)

  if (!isInteractive) {
    return (
      <span
        className={classNames(
          'inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-700',
          className,
        )}
      >
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={classNames(
        'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        isSelected
          ? 'border-brand-primary bg-brand-primary text-white'
          : 'border-surface-border bg-white text-ink-700 hover:bg-surface-muted',
        className,
      )}
    >
      {label}
    </button>
  )
}
