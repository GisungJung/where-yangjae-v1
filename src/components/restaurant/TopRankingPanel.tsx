/**
 * 데스크톱 워크스페이스 우측 TOP5 대시보드 (2026-10-07).
 * 설계: doc/plan/features/2026-10-07-desktop-top5-design.md
 *
 * - `/`(식당 미선택)에서 지도 자리에 표시. 식당 선택 시 지도로 전환된다.
 * - 점심 / 저녁회식 두 행을 위아래로, 각 행은 1~5위 카드를 가로 5칸으로.
 *   우측 영역을 꽉 채우도록 행·카드 모두 남는 높이를 나눠 가진다.
 * - 카드 이미지: 식당 대표 사진(썸네일), 없으면 카테고리 이모지 플레이스홀더.
 * - 5위 미만이면 빈 카드로 자리를 유지해 격자가 흔들리지 않게 한다.
 * - 순위 규칙은 utils/ranking.ts (평가 2건 이상, 평균순). 리스트 필터와 무관.
 */

import { Link } from 'react-router-dom'
import type { RestaurantWithStats, SheetType } from '@/types/domain'
import { formatScore } from '@/utils/format'
import { MIN_RATING_COUNT, selectTopRanked } from '@/utils/ranking'
import { pickCover } from '@/utils/restaurantPhotos'
import { getRestaurantPhotoUrl } from '@/api/restaurantPhotos'
import { useRestaurantPhotos } from '@/hooks/useRestaurantPhotos'
import { CategoryChip } from './CategoryChip'

interface Props {
  restaurants: RestaurantWithStats[]
  isLoading: boolean
}

const TOP_N = 5

const ROWS: { sheetType: SheetType; title: string; emoji: string }[] = [
  { sheetType: 'lunch', title: '점심 TOP 5', emoji: '🍚' },
  { sheetType: 'dinner', title: '저녁회식 TOP 5', emoji: '🍻' },
]

export function TopRankingPanel({ restaurants, isLoading }: Props) {
  return (
    <section
      aria-label="별점 TOP 5"
      className="flex h-full flex-col gap-4 overflow-y-auto bg-surface-muted p-5"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-ink-900">별점 TOP 5</h2>
        <p className="text-xs text-ink-500">
          운영 중 · 평가 {MIN_RATING_COUNT}건 이상 기준
        </p>
      </header>

      {ROWS.map((row) => (
        <RankingRow
          key={row.sheetType}
          title={row.title}
          emoji={row.emoji}
          items={selectTopRanked(restaurants, row.sheetType, TOP_N)}
          isLoading={isLoading}
        />
      ))}
    </section>
  )
}

function RankingRow({
  title,
  emoji,
  items,
  isLoading,
}: {
  title: string
  emoji: string
  items: RestaurantWithStats[]
  isLoading: boolean
}) {
  return (
    <div className="flex min-h-[260px] flex-1 flex-col">
      <h3 className="mb-2 flex shrink-0 items-center gap-2 text-base font-bold text-ink-900">
        <span aria-hidden>{emoji}</span>
        {title}
      </h3>
      <ol className="grid flex-1 grid-cols-5 gap-3">
        {Array.from({ length: TOP_N }, (_, i) => (
          <li key={items[i]?.id ?? `empty-${i}`} className="flex min-w-0">
            {isLoading ? (
              <div className="sk-shimmer w-full rounded-card" aria-hidden />
            ) : items[i] ? (
              <RankCard rank={i + 1} restaurant={items[i]} />
            ) : (
              <EmptyCard rank={i + 1} />
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function RankCard({
  rank,
  restaurant,
}: {
  rank: number
  restaurant: RestaurantWithStats
}) {
  const { photos } = useRestaurantPhotos(restaurant.id)
  const cover = pickCover(photos)

  return (
    <Link
      to={`/restaurants/${restaurant.id}`}
      aria-label={`${rank}위 ${restaurant.name} 상세 보기`}
      className="flex w-full flex-col overflow-hidden rounded-card border border-surface-border-soft bg-white shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <div className="relative min-h-[96px] flex-1 bg-surface-muted">
        {cover ? (
          <img
            src={getRestaurantPhotoUrl(cover.thumb_path)}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-3xl opacity-60"
          >
            🍽️
          </span>
        )}
        <span
          className={[
            'absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold shadow',
            rank <= 3 ? 'bg-brand-primary text-white' : 'bg-white text-ink-700',
          ].join(' ')}
        >
          {rank}
        </span>
      </div>

      <div className="shrink-0 space-y-1 p-3">
        <p
          className="truncate text-[15px] font-bold text-ink-900"
          title={restaurant.name}
        >
          {restaurant.name}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <CategoryChip label={restaurant.category} />
          <span className="whitespace-nowrap text-[13px] font-bold text-brand-accent">
            ★ {formatScore(restaurant.avg_score, '—')}
            <span className="ml-1 text-[11px] font-medium text-ink-500">
              {restaurant.rating_count}명
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}

function EmptyCard({ rank }: { rank: number }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-surface-border bg-white/60 p-3 text-center text-ink-300">
      <span className="text-lg font-bold">{rank}</span>
      <span className="text-[11px]">
        평가 {MIN_RATING_COUNT}건 이상
        <br />
        식당을 기다리는 중
      </span>
    </div>
  )
}
