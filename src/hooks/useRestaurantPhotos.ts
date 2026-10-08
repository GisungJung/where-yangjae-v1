/**
 * React Query 훅: 식당 사진 (2026-10-07)
 *
 * 전체 사진(최대 ~240행)을 한 번에 조회해 식당별로 묶는다 — 목록 카드 N개가
 * 같은 쿼리를 공유(중복 요청 없음). 상세·수정 화면도 같은 캐시를 쓴다.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllRestaurantPhotos } from '@/api/restaurantPhotos'
import type { RestaurantPhoto } from '@/types/domain'
import { groupPhotosByRestaurant } from '@/utils/restaurantPhotos'

const FIVE_MINUTES = 5 * 60 * 1000
const EMPTY: RestaurantPhoto[] = []

export const restaurantPhotosKeys = {
  all: ['restaurant_photos'] as const,
}

export function useRestaurantPhotoMap() {
  const query = useQuery({
    queryKey: restaurantPhotosKeys.all,
    queryFn: fetchAllRestaurantPhotos,
    staleTime: FIVE_MINUTES,
  })
  const map = useMemo(
    () => groupPhotosByRestaurant(query.data ?? EMPTY),
    [query.data],
  )
  return { ...query, map }
}

/** 식당 1곳의 사진 (sort_order 오름차순). */
export function useRestaurantPhotos(restaurantId: string | undefined) {
  const { map, ...rest } = useRestaurantPhotoMap()
  return {
    ...rest,
    photos: (restaurantId && map.get(restaurantId)) || EMPTY,
  }
}
