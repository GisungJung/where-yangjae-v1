/**
 * 별점 표시/입력 컴포넌트
 *
 * - 표시 모드(`readOnly`): 평균 평점·평가별 별점 시각화에 사용.
 * - 입력 모드: 0.5점 단위 클릭. 키보드 좌우 화살표 지원.
 *
 * 0.5점 표현은 별 5개 위에 width(%) clip을 덮어 절반 색칠을 구현한다.
 * 외부 의존성 없는 순수 컴포넌트.
 */

import { useState } from 'react'
import { classNames } from '../../utils/format'

type Size = 'sm' | 'md' | 'lg'

const SIZE_MAP: Record<Size, { star: string; gap: string }> = {
  sm: { star: 'text-base', gap: 'gap-0.5' },
  md: { star: 'text-xl', gap: 'gap-1' },
  lg: { star: 'text-3xl', gap: 'gap-1' },
}

interface CommonProps {
  size?: Size
  className?: string
}

interface ReadOnlyProps extends CommonProps {
  readOnly: true
  value: number | null
  onChange?: never
}

interface EditableProps extends CommonProps {
  readOnly?: false
  value: number
  onChange: (next: number) => void
  ariaLabel?: string
}

export type StarRatingProps = ReadOnlyProps | EditableProps

export function StarRating(props: StarRatingProps) {
  const { size = 'md', className } = props
  const sz = SIZE_MAP[size]

  if (props.readOnly) {
    const value = props.value ?? 0
    return (
      <span
        className={classNames(
          'relative inline-block whitespace-nowrap leading-none',
          sz.star,
          className,
        )}
        aria-label={
          props.value === null ? '평가 없음' : `평균 ${value.toFixed(1)}점`
        }
      >
        <span className="text-ink-300">★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden text-brand-warn"
          style={{ width: `${(value / 5) * 100}%` }}
          aria-hidden
        >
          ★★★★★
        </span>
      </span>
    )
  }

  return <EditableStars {...props} sz={sz} />
}

function EditableStars(
  props: EditableProps & { sz: { star: string; gap: string } },
) {
  const { value, onChange, sz, ariaLabel, className } = props
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(5, value + 0.5))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(0, value - 0.5))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(5)
    }
  }

  return (
    <div
      role="slider"
      aria-label={ariaLabel ?? '별점 입력'}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-valuetext={`${value.toFixed(1)}점 (5점 만점)`}
      tabIndex={0}
      onKeyDown={handleKey}
      onMouseLeave={() => setHover(null)}
      className={classNames(
        'inline-flex select-none items-center',
        sz.gap,
        sz.star,
        'rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-primary',
        className,
      )}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <StarSlot
          key={i}
          fill={Math.max(0, Math.min(1, display - i))}
          onPick={(half) => onChange(i + half)}
          onHover={(half) => setHover(i + half)}
        />
      ))}
    </div>
  )
}

function StarSlot(props: {
  fill: number // 0, 0.5, 1
  onPick: (half: 0.5 | 1) => void
  onHover: (half: 0.5 | 1) => void
}) {
  const { fill, onPick, onHover } = props
  return (
    <span className="relative inline-block leading-none" aria-hidden>
      <span className="text-ink-300">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-brand-warn"
        style={{ width: `${fill * 100}%` }}
      >
        ★
      </span>
      {/* 절반 클릭 영역 */}
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
        onClick={() => onPick(0.5)}
        onMouseEnter={() => onHover(0.5)}
        aria-label="반 점"
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
        onClick={() => onPick(1)}
        onMouseEnter={() => onHover(1)}
        aria-label="한 점"
      />
    </span>
  )
}
