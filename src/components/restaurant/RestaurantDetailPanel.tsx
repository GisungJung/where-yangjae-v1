/**
 * 데스크톱 워크스페이스 상세 패널 — 목록 패널 옆에 열리는 두 번째 패널.
 *
 * 설계: doc/plan/features/2026-08-12-desktop-naver-layout-design.md §2·§4
 * - 헤더: 식당명 + ⋯(액션시트) + 닫기(X → `/`)
 * - 본문: RestaurantDetailContent 재사용 (미니 지도 없음 — 우측 전체 지도가 포커스)
 * - 내부 스크롤. 지도는 그대로 유지된 채 열리고 닫힌다.
 */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  NotFoundLike,
  RestaurantDetailContent,
} from './RestaurantDetailContent'
import { Icon } from '@/components/ui/Icon'
import { useRestaurant } from '@/hooks/useRestaurants'

export function RestaurantDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: restaurant } = useRestaurant(id)
  const [actionsOpen, setActionsOpen] = useState(false)

  return (
    <section
      aria-label="식당 상세"
      className="flex h-full w-[400px] shrink-0 flex-col border-r border-surface-border bg-white"
    >
      <header className="flex items-center gap-1 border-b border-surface-border px-4 py-3">
        <h2
          className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink-900"
          title={restaurant?.name}
        >
          {restaurant?.name ?? '식당 상세'}
        </h2>
        {restaurant && (
          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            aria-label="더보기"
            aria-haspopup="menu"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
          >
            <Icon name="more-h" size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="상세 닫기"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
        >
          <Icon name="x" size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {id ? (
          <RestaurantDetailContent
            id={id}
            showMiniMap={false}
            actionsOpen={actionsOpen}
            onActionsOpenChange={setActionsOpen}
          />
        ) : (
          <NotFoundLike />
        )}
      </div>
    </section>
  )
}
