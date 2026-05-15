/**
 * 빈 상태 컴포넌트 (목업 §09).
 *
 * 4종 SVG 일러스트 + 동적 텍스트 + 1~2개 CTA 구조.
 *
 * 일러스트 종류:
 *   - 'search-empty'     : 검색 결과 없음 (회색 돋보기 + 주황 X)
 *   - 'restaurants-empty': 식당 0건 (빈 접시)
 *   - 'ratings-empty'    : 평가 0건 (빈 별)
 *   - 'roulette-empty'   : 룰렛 풀 0건 (룰렛 휠)
 *
 * Action chip 제안은 선택 사항 — `suggestChips` prop으로 전달.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type EmptyIllust =
  | 'search-empty'
  | 'restaurants-empty'
  | 'ratings-empty'
  | 'roulette-empty'

interface Props {
  illust?: EmptyIllust
  title: string
  description?: ReactNode
  primaryAction?: {
    label: ReactNode
    onClick?: () => void
    href?: string
  }
  secondaryAction?: {
    label: ReactNode
    onClick?: () => void
    href?: string
  }
  /** "이런 카테고리는 어때요?" 칩 제안 (선택). */
  suggestChips?: Array<{ label: string; onClick: () => void }>
  className?: string
}

export function EmptyState({
  illust = 'search-empty',
  title,
  description,
  primaryAction,
  secondaryAction,
  suggestChips,
  className,
}: Props) {
  return (
    <div
      className={[
        'rounded-card border border-dashed border-surface-border bg-white px-7 py-12 text-center',
        className ?? '',
      ].join(' ')}
    >
      <div className="mx-auto mb-4 h-24 w-24">
        <EmptyIllustration kind={illust} />
      </div>
      <h3 className="mb-2 text-base font-extrabold text-ink-900">{title}</h3>
      {description && (
        <p className="mb-5 text-[13px] leading-relaxed text-ink-700">
          {description}
        </p>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="mx-auto mb-5 flex max-w-[240px] flex-col gap-2">
          {primaryAction && (
            <ActionButton variant="primary" {...primaryAction} />
          )}
          {secondaryAction && (
            <ActionButton variant="outline" {...secondaryAction} />
          )}
        </div>
      )}

      {suggestChips && suggestChips.length > 0 && (
        <div className="mx-4 border-t border-dashed border-surface-border pt-4">
          <p className="mb-2 text-xs font-semibold text-ink-500">
            이런 카테고리는 어때요?
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {suggestChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.onClick}
                className="rounded-full border border-surface-border bg-surface-muted px-3 py-1 text-xs text-ink-700 hover:bg-white"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({
  variant,
  label,
  onClick,
  href,
}: {
  variant: 'primary' | 'outline'
  label: ReactNode
  onClick?: () => void
  href?: string
}) {
  const cls =
    variant === 'primary'
      ? 'inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-button bg-brand-primary text-sm font-bold text-white hover:bg-brand-primary-dark'
      : 'inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-button border border-brand-primary bg-white text-sm font-bold text-brand-primary hover:bg-surface-muted'
  if (href) {
    // 외부 링크면 <a>, 내부 라우트면 React Router Link.
    const isExternal = /^https?:\/\//.test(href)
    if (isExternal) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {label}
        </a>
      )
    }
    return (
      <Link to={href} className={cls}>
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  )
}

function EmptyIllustration({ kind }: { kind: EmptyIllust }) {
  if (kind === 'search-empty') {
    return (
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="#F5F7FA" />
        <circle
          cx="40"
          cy="40"
          r="17"
          fill="#fff"
          stroke="#9aa0a6"
          strokeWidth="3"
        />
        <path
          d="m53 53 14 14"
          stroke="#9aa0a6"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <g stroke="#FF6B35" strokeWidth="3" strokeLinecap="round">
          <path d="m32 32 16 16" />
          <path d="m48 32-16 16" />
        </g>
      </svg>
    )
  }
  if (kind === 'restaurants-empty') {
    return (
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="#F5F7FA" />
        {/* 빈 접시 */}
        <ellipse
          cx="48"
          cy="58"
          rx="28"
          ry="6"
          fill="#fff"
          stroke="#9aa0a6"
          strokeWidth="2.5"
        />
        <ellipse
          cx="48"
          cy="55"
          rx="22"
          ry="4"
          fill="#F5F7FA"
          stroke="#9aa0a6"
          strokeWidth="1.5"
        />
        {/* 김 모락모락 */}
        <g
          fill="none"
          stroke="#FF6B35"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.6"
        >
          <path d="M38 38c2-4 -2-6 0-10" />
          <path d="M48 34c2-4 -2-6 0-10" />
          <path d="M58 38c2-4 -2-6 0-10" />
        </g>
      </svg>
    )
  }
  if (kind === 'ratings-empty') {
    return (
      <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="#F5F7FA" />
        {/* 빈 별 */}
        <path
          d="M48 26 L54 42 L71 43 L58 53 L62 70 L48 60 L34 70 L38 53 L25 43 L42 42 Z"
          fill="#fff"
          stroke="#9aa0a6"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* 작은 +들 */}
        <g stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round">
          <path d="M75 30v6M72 33h6" />
          <path d="M20 60v4M18 62h4" />
        </g>
      </svg>
    )
  }
  // roulette-empty
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="44" fill="#F5F7FA" />
      {/* 룰렛 휠 6분할 */}
      <circle
        cx="48"
        cy="48"
        r="26"
        fill="#fff"
        stroke="#9aa0a6"
        strokeWidth="2.5"
      />
      <g stroke="#9aa0a6" strokeWidth="1.5">
        <path d="M48 22v52" />
        <path d="M22 48h52" />
        <path d="M30 30l36 36" />
        <path d="M30 66l36-36" />
      </g>
      <circle cx="48" cy="48" r="5" fill="#FF6B35" />
      {/* 화살표 */}
      <path
        d="M48 8 L52 18 L44 18 Z"
        fill="#FF6B35"
        stroke="#FF6B35"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
