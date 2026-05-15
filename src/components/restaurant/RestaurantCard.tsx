/**
 * 홈 목록의 식당 카드 — 목업 §01 rest-card.
 *
 * row1: [이름 (truncate)]                     [★ 4.6 12명]
 * 아래: 카테고리/방향/시트 배지 + (휴업·폐업 배지) + 비고 line-clamp
 *
 * - 폐업: 카드 전체 opacity-75 + 이름·비고 line-through (dimmed 변형, 목업 §815~826)
 * - 휴업: 동일한 dimmed 적용
 * - 좌표 미등록은 별도 회색 배지로 유지 (콘텐츠 의미 갖는 📍는 보존)
 */

import { Link } from 'react-router-dom'
import type { RestaurantWithStats } from '../../types/domain'
import { formatScore } from '../../utils/format'
import { CategoryChip } from './CategoryChip'
import { Icon } from '../ui/Icon'

interface Props {
  restaurant: RestaurantWithStats
}

export function RestaurantCard({ restaurant }: Props) {
  const isClosed = restaurant.status === '폐업'
  const isPaused = restaurant.status === '휴업'
  const dimmed = isClosed || isPaused
  const noCoord = restaurant.lat === null || restaurant.lng === null
  const hasRating = restaurant.rating_count > 0

  return (
    <Link
      to={`/restaurants/${restaurant.id}`}
      className={[
        'block rounded-card border border-surface-border-soft bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary',
        dimmed ? 'opacity-75 bg-surface-muted' : '',
      ].join(' ')}
      aria-label={`${restaurant.name} 상세 보기`}
    >
      {/* row1: 이름 좌 / 평점 우 */}
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className={[
            'min-w-0 flex-1 truncate text-[15px] font-bold leading-tight text-ink-900',
            isClosed ? 'text-ink-500 line-through' : '',
            isPaused ? 'text-ink-500' : '',
          ].join(' ')}
          title={restaurant.name}
        >
          {restaurant.name}
        </h3>
        {hasRating ? (
          <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-brand-accent">
            ★ {formatScore(restaurant.avg_score, '—')}
            <span className="ml-1 text-[12px] font-medium text-ink-500">
              {restaurant.rating_count}명
            </span>
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-ink-300">
            평가 없음
          </span>
        )}
      </div>

      {/* 배지 행 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {isPaused && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-warn-soft px-2 py-0.5 text-[11px] font-bold text-amber-800">
            <Icon name="pause" size={11} />
            휴업
          </span>
        )}
        {isClosed && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
            <Icon name="trash" size={11} />
            폐업
          </span>
        )}
        <CategoryChip label={restaurant.category} />
        <CategoryChip
          label={restaurant.sheet_type === 'lunch' ? '점심' : '저녁회식'}
        />
        {noCoord && (
          <span
            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
            aria-label="위치 미등록"
            title="위치 미등록"
          >
            📍 위치 미등록
          </span>
        )}
      </div>

      {restaurant.menu && (
        <p
          className={[
            'mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-700',
            isClosed ? 'line-through text-ink-500' : '',
          ].join(' ')}
        >
          {restaurant.menu}
        </p>
      )}
      {restaurant.note && (
        <p
          className={[
            'mt-1 line-clamp-1 text-[12px] text-ink-500',
            isClosed ? 'line-through' : '',
          ].join(' ')}
        >
          {restaurant.note}
        </p>
      )}
    </Link>
  )
}
