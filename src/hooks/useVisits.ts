/**
 * React Query 훅: 방문 체크인 (2026-10-08)
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md
 *
 * - 내 최근 7일 기록: 쿼리 키에 reviewerId 포함 — 첫 체크인으로 정체성이 생기면 재조회.
 * - 체크인: reviewerId가 없으면 닉네임으로 reviewer를 만들고 setIdentity 후 기록
 *   (fetch 래퍼가 매 요청 store에서 헤더를 읽으므로 바로 RLS 통과).
 * - 기록·취소 후 내 기록 + 식당 목록(방문 집계 합류) 캐시 무효화.
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteVisit,
  fetchMyRecentVisits,
  insertVisit,
  type MyRecentVisits,
} from '@/api/visits'
import { upsertReviewerByNickname } from '@/api/reviewers'
import { useNicknameStore } from '@/store/nicknameStore'
import { kstDateString } from '@/utils/kstDate'
import { restaurantsKeys } from './useRestaurants'
import type { RestaurantVisit } from '@/types/domain'

const ONE_MINUTE = 60 * 1000

export const visitsKeys = {
  mine: ['restaurant_visits', 'mine'] as const,
  mineFor: (reviewerId: string | null) =>
    [...visitsKeys.mine, reviewerId ?? 'anonymous'] as const,
}

export function useMyRecentVisits() {
  const reviewerId = useNicknameStore((s) => s.reviewerId)
  return useQuery({
    queryKey: visitsKeys.mineFor(reviewerId),
    queryFn: fetchMyRecentVisits,
    staleTime: ONE_MINUTE,
  })
}

export function useCheckIn() {
  const queryClient = useQueryClient()
  const reviewerId = useNicknameStore((s) => s.reviewerId)
  const setIdentity = useNicknameStore((s) => s.setIdentity)
  const { data } = useMyRecentVisits()

  const visits = data?.visits
  const recentIds = useMemo(
    () => new Set((visits ?? []).map((v) => v.restaurant_id)),
    [visits],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: visitsKeys.mine })
    void queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
  }

  const checkIn = useMutation({
    mutationFn: async ({
      restaurantId,
      nickname,
    }: {
      restaurantId: string
      nickname?: string
    }): Promise<RestaurantVisit> => {
      let id = reviewerId
      if (!id) {
        const trimmed = nickname?.trim()
        if (!trimmed) throw new Error('닉네임을 입력해 주세요.')
        const reviewer = await upsertReviewerByNickname(trimmed)
        setIdentity(trimmed, reviewer.id)
        id = reviewer.id
      }
      return insertVisit(restaurantId, id)
    },
    // 즉시 반영 — 재조회 전 버튼이 이전 상태로 깜빡이지 않게 캐시를 먼저 갱신.
    // 첫 체크인이면 정체성이 막 생겨 새 키(visit.reviewer_id)에 채운다.
    onSuccess: (visit) => {
      queryClient.setQueryData<MyRecentVisits>(
        visitsKeys.mineFor(visit.reviewer_id),
        (old) => ({
          available: true,
          visits: [visit, ...(old?.visits ?? []).filter((v) => v.id !== visit.id)],
        }),
      )
    },
    onSettled: invalidate,
  })

  const undo = useMutation({
    mutationFn: (visit: RestaurantVisit) => deleteVisit(visit.id),
    onSuccess: (_, visit) => {
      queryClient.setQueryData<MyRecentVisits>(
        visitsKeys.mineFor(visit.reviewer_id),
        (old) =>
          old && { ...old, visits: old.visits.filter((v) => v.id !== visit.id) },
      )
    },
    onSettled: invalidate,
  })

  const todayVisitFor = (restaurantId: string): RestaurantVisit | null => {
    const today = kstDateString()
    return (
      visits?.find(
        (v) => v.restaurant_id === restaurantId && v.visited_on === today,
      ) ?? null
    )
  }

  return {
    /** 테이블이 있어야 체크인 UI를 보여준다 (로딩 중엔 false) */
    available: data?.available ?? false,
    hasIdentity: Boolean(reviewerId),
    /** 오늘 포함 최근 7일 내가 체크인한 식당 id */
    recentIds,
    todayVisitFor,
    checkIn,
    undo,
  }
}
