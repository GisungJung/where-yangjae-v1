import { useQuery } from '@tanstack/react-query'
import { fetchRatingsByRestaurant } from '../api/ratings'

const TWO_MINUTES = 2 * 60 * 1000

export const ratingsKeys = {
  all: ['ratings'] as const,
  byRestaurant: (id: string) =>
    [...ratingsKeys.all, 'byRestaurant', id] as const,
}

export function useRatings(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId
      ? ratingsKeys.byRestaurant(restaurantId)
      : ratingsKeys.byRestaurant('__none__'),
    queryFn: () => fetchRatingsByRestaurant(restaurantId as string),
    enabled: Boolean(restaurantId),
    staleTime: TWO_MINUTES,
  })
}
