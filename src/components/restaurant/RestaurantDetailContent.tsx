/**
 * 식당 상세 본문 — 모바일 페이지(RestaurantDetailPage)와
 * 데스크톱 패널(RestaurantDetailPanel)이 공유한다.
 *
 * 기획서 §8.2 + 목업 §02·§08. 마크업·상태 전이는 기존 페이지 구현을 그대로 이동:
 * - 평점 분포 / 비고 warn 박스 / 한줄평 목록 / 평가 작성 폼
 * - ⋯ 액션(수정 / 휴업·운영중 / 폐업) — ActionSheet + 폐업 ConfirmDialog 2단 확인
 * - `showMiniMap=false`(데스크톱 패널)면 임베드 지도를 생략 — 우측 전체 지도가
 *   해당 식당을 포커스하므로 중복. 좌표 없는 식당의 "위치 미등록" 안내는 유지.
 * - ActionSheet 열림 상태는 소비자(페이지 헤더/패널 헤더의 ⋯ 버튼)가 소유한다.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KakaoMapView } from '../map/KakaoMapView'
import { RatingList } from '../rating/RatingList'
import { RatingForm } from '../rating/RatingForm'
import { ScoreDistribution } from '../rating/ScoreDistribution'
import { Icon } from '../ui/Icon'
import { ActionSheet, type ActionSheetItem } from '../ui/ActionSheet'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../empty/EmptyState'
import { useRestaurant, restaurantsKeys } from '../../hooks/useRestaurants'
import { useRatings } from '../../hooks/useRatings'
import { updateRestaurantStatus } from '../../api/restaurants'
import type { RestaurantStatus } from '../../types/domain'

interface Props {
  id: string
  /** 데스크톱 패널에서는 false — 우측 전체 지도가 위치를 담당 */
  showMiniMap?: boolean
  /** ⋯ 액션시트 열림 상태 (트리거 버튼은 페이지/패널 헤더에 있음) */
  actionsOpen: boolean
  onActionsOpenChange: (open: boolean) => void
}

export function RestaurantDetailContent({
  id,
  showMiniMap = true,
  actionsOpen,
  onActionsOpenChange,
}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: restaurant, isLoading, isError, error } = useRestaurant(id)
  const { data: ratings, isLoading: ratingsLoading } = useRatings(id)

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const statusMutation = useMutation({
    mutationFn: ({
      restaurantId,
      status,
    }: {
      restaurantId: string
      status: RestaurantStatus
    }) => updateRestaurantStatus(restaurantId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
      setStatusError(null)
    },
    onError: (err) => {
      setStatusError(err instanceof Error ? err.message : '상태 변경 실패')
    },
  })

  const ratingCount = ratings?.length ?? 0

  // 액션 시트 메뉴 구성 — restaurant 로드 후에만 표시.
  const sheetItems: ActionSheetItem[] = restaurant
    ? [
        {
          icon: 'pencil',
          label: '정보 수정',
          onSelect: () => navigate(`/restaurants/${restaurant.id}/edit`),
        },
        restaurant.status === '운영중'
          ? {
              icon: 'pause',
              label: '휴업으로 표시',
              onSelect: () =>
                statusMutation.mutate({
                  restaurantId: restaurant.id,
                  status: '휴업',
                }),
            }
          : {
              icon: 'refresh',
              label: '다시 운영중으로',
              onSelect: () =>
                statusMutation.mutate({
                  restaurantId: restaurant.id,
                  status: '운영중',
                }),
            },
        ...(restaurant.status !== '폐업'
          ? ([
              {
                icon: 'trash',
                label: '폐업으로 표시',
                variant: 'danger',
                onSelect: () => setConfirmCloseOpen(true),
              },
            ] as ActionSheetItem[])
          : []),
      ]
    : []

  return (
    <>
      {isLoading && <DetailSkeleton />}

      {isError && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">식당 정보를 불러올 수 없어요.</p>
          <p className="mt-1 text-xs text-red-600">
            {error instanceof Error ? error.message : '알 수 없는 오류'}
          </p>
          <Link
            to="/"
            className="mt-3 inline-block rounded-button border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700"
          >
            홈으로
          </Link>
        </div>
      )}

      {!isLoading && !isError && !restaurant && <NotFoundLike />}

      {statusError && (
        <div
          role="alert"
          className="mb-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          {statusError}
        </div>
      )}

      {restaurant && (
        <article className="space-y-4">
          <header className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink-900">
                {restaurant.name}
              </h1>
              <StatusBadge status={restaurant.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-[13px] font-semibold text-ink-700">
                <Icon name="map-pin" size={13} />
                {restaurant.region}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary-soft px-3 py-1 text-[13px] font-semibold text-brand-primary-dark">
                <Icon name="utensils" size={13} />
                {restaurant.category}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent-soft px-3 py-1 text-[13px] font-semibold text-orange-700">
                <Icon
                  name={restaurant.sheet_type === 'lunch' ? 'sun' : 'moon'}
                  size={13}
                />
                {restaurant.sheet_type === 'lunch' ? '점심' : '저녁회식'}
              </span>
            </div>
            {restaurant.menu && (
              <p className="whitespace-pre-line pt-1 text-sm leading-relaxed text-ink-700">
                {restaurant.menu}
              </p>
            )}
          </header>

          {restaurant.lat !== null && restaurant.lng !== null ? (
            showMiniMap ? (
              <section className="h-[200px] overflow-hidden rounded-card border border-surface-border bg-surface-muted">
                <KakaoMapView
                  markers={[
                    {
                      id: restaurant.id,
                      lat: restaurant.lat,
                      lng: restaurant.lng,
                      title: restaurant.name,
                    },
                  ]}
                  center={{ lat: restaurant.lat, lng: restaurant.lng }}
                  className="h-full w-full"
                  level={3}
                />
              </section>
            ) : null
          ) : (
            <section
              className="space-y-2 rounded-card border border-dashed border-surface-border bg-surface-muted p-6 text-center text-sm text-ink-500"
              aria-label="위치 미등록"
            >
              <p className="font-medium text-ink-700">📍 위치 미등록</p>
              <p className="text-xs">
                좌표가 등록되지 않은 식당이에요.
                {restaurant.naver_url && ' 네이버 지도 링크로 확인해 주세요.'}
              </p>
              {restaurant.naver_url && (
                <a
                  href={restaurant.naver_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-button border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-white"
                >
                  네이버 지도에서 보기 ↗
                </a>
              )}
            </section>
          )}

          {/* 평점 블록 — 항상 표시. 0건이면 ScoreDistribution 내부에서 빈 상태 렌더. */}
          <ScoreDistribution ratings={ratings ?? []} />

          {/* G8: 비고는 warn 강조 박스 */}
          {restaurant.note && (
            <aside
              className="flex items-start gap-2 rounded-r-card border-l-[3px] border-brand-warn bg-brand-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-amber-900"
              aria-label="비고"
            >
              <Icon
                name="lightbulb"
                size={16}
                className="mt-0.5 shrink-0 text-brand-warn"
              />
              <div>
                <span className="font-bold">비고</span> ·{' '}
                <span className="whitespace-pre-line">{restaurant.note}</span>
              </div>
            </aside>
          )}

          {restaurant.naver_url && restaurant.lat !== null && (
            <a
              href={restaurant.naver_url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-button border border-surface-border bg-white px-4 py-2 text-center text-sm font-medium text-brand-primary hover:bg-surface-muted"
            >
              네이버 지도에서 보기 ↗
            </a>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-700">
              한줄평 {ratingCount > 0 ? `(${ratingCount})` : ''}
            </h2>
            {ratingsLoading ? (
              <ul className="space-y-2" aria-hidden>
                {Array.from({ length: 2 }).map((_, i) => (
                  <li
                    key={i}
                    className="h-20 animate-pulse rounded-card border border-surface-border bg-white"
                  />
                ))}
              </ul>
            ) : ratingCount === 0 ? (
              <EmptyState
                illust="ratings-empty"
                title="아직 평가가 없어요"
                description="첫 평가를 남겨보세요!"
              />
            ) : (
              <RatingList
                ratings={ratings ?? []}
                restaurantId={restaurant.id}
              />
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-700">
              평가 작성
            </h2>
            {restaurant.status === '폐업' ? (
              <div className="rounded-card border border-dashed border-surface-border bg-surface-muted p-4 text-center text-sm text-ink-500">
                폐업한 식당입니다 — 더 이상 평가를 받지 않아요.
              </div>
            ) : (
              <RatingForm restaurantId={restaurant.id} />
            )}
          </section>
        </article>
      )}

      <ActionSheet
        open={actionsOpen}
        onClose={() => onActionsOpenChange(false)}
        items={sheetItems}
        title={restaurant?.name}
      />
      <ConfirmDialog
        open={confirmCloseOpen}
        title="폐업 처리할까요?"
        icon="trash"
        message={
          <>
            <strong>{restaurant?.name}</strong>을(를) 폐업 처리합니다.
            <br />
            목록에서 숨겨지지만 과거 평가{' '}
            <strong>{restaurant?.rating_count ?? 0}건</strong>은 보존돼요.
          </>
        }
        confirmLabel="폐업 처리"
        cancelLabel="취소"
        danger
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          if (!restaurant) return
          statusMutation.mutate({
            restaurantId: restaurant.id,
            status: '폐업',
          })
          setConfirmCloseOpen(false)
        }}
      />
    </>
  )
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  if (status === '운영중') return null
  if (status === '휴업') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-warn-soft px-2 py-0.5 text-xs font-bold text-amber-800">
        <Icon name="pause" size={11} />
        휴업
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
      <Icon name="trash" size={11} />
      폐업
    </span>
  )
}

export function NotFoundLike() {
  return (
    <div className="rounded-card border border-dashed border-surface-border bg-white p-8 text-center">
      <p className="text-sm font-medium text-ink-700">
        식당을 찾을 수 없어요.
      </p>
      <p className="mt-1 text-xs text-ink-500">
        삭제되었거나 잘못된 주소입니다.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block rounded-button bg-brand-primary px-4 py-2 text-sm font-medium text-white"
      >
        홈으로
      </Link>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="sk-shimmer h-8 w-2/3 rounded" />
      <div className="sk-shimmer h-6 w-1/3 rounded" />
      <div className="sk-shimmer h-64 rounded-card" />
      <div className="sk-shimmer h-24 rounded-card" />
    </div>
  )
}
