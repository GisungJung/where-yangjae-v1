/**
 * React Query 훅: reviewer 단건 (상세 화면 등록자 표시용)
 *
 * 닉네임은 자주 바뀌지 않으므로 staleTime 5분 — useRestaurants와 동일 정책.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchReviewerById } from '@/api/reviewers'

const FIVE_MINUTES = 5 * 60 * 1000

export const reviewersKeys = {
  all: ['reviewers'] as const,
  detail: (id: string) => [...reviewersKeys.all, 'detail', id] as const,
}

export function useReviewer(id: string | null | undefined) {
  return useQuery({
    queryKey: reviewersKeys.detail(id ?? '__none__'),
    queryFn: () => fetchReviewerById(id as string),
    enabled: Boolean(id),
    staleTime: FIVE_MINUTES,
  })
}
