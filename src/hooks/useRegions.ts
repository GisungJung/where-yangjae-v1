/**
 * React Query 훅: 지역 기준점 목록.
 *
 * 거의 변하지 않는 데이터(지역 추가는 관리자 SQL) — staleTime 30분.
 * fetchRegions가 실패·부재 시 폴백 상수를 반환하므로 error 상태가 거의 없다.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchRegions } from '@/api/regions'

const THIRTY_MINUTES = 30 * 60 * 1000

export const regionsKeys = {
  all: ['regions'] as const,
}

export function useRegions() {
  return useQuery({
    queryKey: regionsKeys.all,
    queryFn: fetchRegions,
    staleTime: THIRTY_MINUTES,
  })
}
