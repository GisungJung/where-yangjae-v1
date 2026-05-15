/**
 * React Query 훅: 평가 사진 (task #12)
 *
 * - 식당 단위 batch 조회 (`listPhotosByRestaurant`) — N+1 회피.
 * - 평가 INSERT/DELETE 후 ratingsKeys 무효화 시 함께 무효화하는 게 정합.
 *   호출부에서 둘 다 invalidate 권장.
 */

import { useQuery } from '@tanstack/react-query'
import { listPhotosByRestaurant } from '../api/photos'

const TWO_MINUTES = 2 * 60 * 1000

export const photosKeys = {
  all: ['rating_photos'] as const,
  byRestaurant: (id: string) =>
    [...photosKeys.all, 'byRestaurant', id] as const,
}

export function usePhotosByRestaurant(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId
      ? photosKeys.byRestaurant(restaurantId)
      : photosKeys.byRestaurant('__none__'),
    queryFn: () => listPhotosByRestaurant(restaurantId as string),
    enabled: Boolean(restaurantId),
    staleTime: TWO_MINUTES,
  })
}
