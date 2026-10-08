/**
 * React Query 훅: 식당 목록 / 단건
 *
 * staleTime 5분 (기획서 §4.2 권장치).
 *
 * 지역 표시(2026-09-03 2차): 저장된 동 이름(region, 역지오코딩)을 우선 쓰고,
 * 없으면(과거 데이터·역지오코딩 실패) 최근접 기준점 파생으로 폴백한다.
 * 하위 컴포넌트는 기존처럼 `r.region`을 읽기만 하면 된다.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchRestaurantById,
  fetchRestaurantsWithStats,
} from '@/api/restaurants'
import { FALLBACK_REGIONS } from '@/api/regions'
import { nearestRegion } from '@/utils/region'
import { useRegions } from './useRegions'

const FIVE_MINUTES = 5 * 60 * 1000

export const restaurantsKeys = {
  all: ['restaurants'] as const,
  list: () => [...restaurantsKeys.all, 'list'] as const,
  detail: (id: string) => [...restaurantsKeys.all, 'detail', id] as const,
}

export function useRestaurants() {
  const { data: regions } = useRegions()
  const query = useQuery({
    queryKey: restaurantsKeys.list(),
    queryFn: fetchRestaurantsWithStats,
    staleTime: FIVE_MINUTES,
  })

  // regions 로딩 중에도 배지가 깜빡이지 않도록 폴백 상수로 즉시 파생.
  const effectiveRegions = regions ?? FALLBACK_REGIONS
  const data = useMemo(() => {
    if (!query.data) return undefined
    return {
      ...query.data,
      data: query.data.data.map((r) => ({
        ...r,
        region: r.region ?? nearestRegion(r.lat, r.lng, effectiveRegions),
      })),
    }
  }, [query.data, effectiveRegions])

  return { ...query, data }
}

export function useRestaurant(id: string | undefined) {
  const { data: regions } = useRegions()
  const query = useQuery({
    queryKey: id ? restaurantsKeys.detail(id) : restaurantsKeys.detail('__none__'),
    queryFn: () => fetchRestaurantById(id as string),
    enabled: Boolean(id),
    staleTime: FIVE_MINUTES,
  })

  const effectiveRegions = regions ?? FALLBACK_REGIONS
  const data = useMemo(() => {
    if (!query.data) return query.data
    return {
      ...query.data,
      region:
        query.data.region ??
        nearestRegion(query.data.lat, query.data.lng, effectiveRegions),
    }
  }, [query.data, effectiveRegions])

  return { ...query, data }
}
