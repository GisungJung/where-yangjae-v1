/**
 * React Query 훅: 식당 목록 / 단건
 *
 * staleTime 5분 (기획서 §4.2 권장치).
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchRestaurantById,
  fetchRestaurantsWithStats,
} from '../api/restaurants'

const FIVE_MINUTES = 5 * 60 * 1000

export const restaurantsKeys = {
  all: ['restaurants'] as const,
  list: () => [...restaurantsKeys.all, 'list'] as const,
  detail: (id: string) => [...restaurantsKeys.all, 'detail', id] as const,
}

export function useRestaurants() {
  return useQuery({
    queryKey: restaurantsKeys.list(),
    queryFn: fetchRestaurantsWithStats,
    staleTime: FIVE_MINUTES,
  })
}

export function useRestaurant(id: string | undefined) {
  return useQuery({
    queryKey: id ? restaurantsKeys.detail(id) : restaurantsKeys.detail('__none__'),
    queryFn: () => fetchRestaurantById(id as string),
    enabled: Boolean(id),
    staleTime: FIVE_MINUTES,
  })
}
