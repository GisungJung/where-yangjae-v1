/**
 * 평점 블록 (목업 §02 rating-block).
 *
 * 가로 flex 레이아웃:
 *   [큰 평균 점수 + 별 + 평가 수]  |  [0.5단위 분포 막대]
 *
 * 평가 0건일 때 좌측은 "—", 우측엔 빈 상태 안내.
 */

import type { RatingWithReviewer } from '../../types/domain'
import { StarRating } from './StarRating'

interface Props {
  ratings: RatingWithReviewer[]
}

/** 5.0 → 0.0 까지 0.5 단위 11개 버킷. */
const BUCKETS = Array.from({ length: 11 }, (_, i) => 5 - i * 0.5)

export function ScoreDistribution({ ratings }: Props) {
  const total = ratings.length

  if (total === 0) {
    return (
      <section
        aria-label="평점"
        className="flex items-center gap-4 rounded-card border border-surface-border bg-white p-4"
      >
        <div className="shrink-0 border-r border-surface-border-soft pr-4 text-center">
          <div className="text-4xl font-extrabold leading-none text-ink-300">
            —
          </div>
          <div className="my-1 text-sm text-ink-300" aria-hidden>
            ☆☆☆☆☆
          </div>
          <div className="text-[11px] text-ink-500">0명 평가</div>
        </div>
        <div className="flex-1 text-xs text-ink-500">
          평가가 쌓이면 점수 분포가 표시돼요.
        </div>
      </section>
    )
  }

  const counts = new Map<number, number>(BUCKETS.map((b) => [b, 0]))
  for (const r of ratings) {
    const key = Math.round(r.score * 2) / 2
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const sum = ratings.reduce((acc, r) => acc + r.score, 0)
  const avg = sum / total
  const max = Math.max(1, ...Array.from(counts.values()))

  return (
    <section
      aria-label="평점 분포"
      className="flex items-center gap-4 rounded-card border border-surface-border bg-white p-4"
    >
      <div className="shrink-0 border-r border-surface-border-soft pr-4 text-center">
        <div className="text-4xl font-extrabold leading-none text-brand-accent">
          {avg.toFixed(1)}
        </div>
        <div className="my-1">
          <StarRating readOnly value={avg} size="sm" />
        </div>
        <div className="text-[11px] text-ink-500">{total}명 평가</div>
      </div>
      <ul className="flex-1 space-y-1">
        {BUCKETS.map((bucket) => {
          const count = counts.get(bucket) ?? 0
          const ratio = count / max
          return (
            <li
              key={bucket}
              className="flex items-center gap-1.5 text-[11px] text-ink-500"
            >
              <span
                className="w-6 shrink-0 text-right font-semibold tabular-nums text-ink-700"
                aria-hidden
              >
                {bucket.toFixed(1)}
              </span>
              <span className="flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-[5px] rounded-full bg-brand-accent transition-all"
                  style={{ width: `${ratio * 100}%` }}
                  aria-hidden
                />
              </span>
              <span className="w-4 shrink-0 text-right tabular-nums">
                {count}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
