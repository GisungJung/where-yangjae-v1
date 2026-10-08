/**
 * 식당 상세 페이지 (라우트: `/restaurants/:id`) — 모바일 전용 셸.
 *
 * 본문은 RestaurantDetailContent로 추출되어 데스크톱 패널
 * (RestaurantDetailPanel)과 공유한다. 이 파일은 모바일 크롬만 담당:
 * - AppShell + 목업 §02 헤더 (좌 chevron-left / 중앙 식당명 / 우 ⋯)
 * - PullToRefresh — 상세·평가 쿼리 새로고침
 * - ⋯ 버튼이 여는 ActionSheet의 열림 상태 소유 (시트 자체는 Content가 렌더)
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { AppHeader } from '@/components/layout/AppHeader'
import { PullToRefresh } from '@/components/layout/PullToRefresh'
import {
  NotFoundLike,
  RestaurantDetailContent,
} from '@/components/restaurant/RestaurantDetailContent'
import { Icon } from '@/components/ui/Icon'
import { useRestaurant, restaurantsKeys } from '@/hooks/useRestaurants'
import { ratingsKeys } from '@/hooks/useRatings'

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  // Content도 같은 쿼리를 구독 — react-query 캐시가 공유되어 중복 fetch 없음.
  const { data: restaurant } = useRestaurant(id)
  const [actionsOpen, setActionsOpen] = useState(false)

  if (!id) {
    return (
      <AppShell>
        <NotFoundLike />
      </AppShell>
    )
  }

  // 목업 §02 — 좌측 chevron-left + 중앙 식당명(truncate) + 우측 more-h.
  const headerNode = (
    <AppHeader
      title={restaurant?.name ?? '식당 상세'}
      rightAction={
        restaurant ? (
          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            aria-label="더보기"
            aria-haspopup="menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-ink-700 hover:bg-surface-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
          >
            <Icon name="more-h" size={18} />
          </button>
        ) : null
      }
    />
  )

  return (
    <AppShell header={headerNode}>
      <PullToRefresh
        onRefresh={async () => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: restaurantsKeys.detail(id),
            }),
            queryClient.invalidateQueries({
              queryKey: ratingsKeys.byRestaurant(id),
            }),
          ])
        }}
      >
        <RestaurantDetailContent
          id={id}
          showMiniMap
          actionsOpen={actionsOpen}
          onActionsOpenChange={setActionsOpen}
        />
      </PullToRefresh>
    </AppShell>
  )
}
