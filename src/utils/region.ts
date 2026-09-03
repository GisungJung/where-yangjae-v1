/**
 * 지역 파생 규칙 — "가장 가까운 기준점"이 그 식당의 지역.
 *
 * DB의 pick_random_restaurant RPC·과거 백필(20260812000001)과 동일한 공식:
 * degree 거리² 비교, 경도차에만 cos(위도) 보정. 서비스 권역이 좁아
 * (기준점 간 수 km) 하버사인 없이 충분하다.
 *
 * 설계: doc/plan/features/2026-09-03-region-derived-design.md
 */

/** 지역 기준점 최소 형태 — domain의 Region과 구조적으로 호환. */
export interface RegionPoint {
  name: string
  lat: number
  lng: number
}

/** 서비스 권역 대표 위도 — RPC의 cos(radians(37.48))와 동일 값 사용. */
const REF_LAT_RAD = (37.48 * Math.PI) / 180

/**
 * 최근접 기준점의 이름을 반환. 좌표가 없거나 기준점이 없으면 null(지역 미지정).
 * 등거리면 목록 순서상 첫 기준점 (안정성 계약 — region.test.ts).
 */
export function nearestRegion(
  lat: number | null,
  lng: number | null,
  regions: readonly RegionPoint[],
): string | null {
  if (lat === null || lng === null || regions.length === 0) return null

  const cosRef = Math.cos(REF_LAT_RAD)
  let best: string | null = null
  let bestDist = Infinity
  for (const r of regions) {
    const dLat = lat - r.lat
    const dLng = (lng - r.lng) * cosRef
    const dist = dLat * dLat + dLng * dLng
    if (dist < bestDist) {
      bestDist = dist
      best = r.name
    }
  }
  return best
}

/** 지구 반지름(km) — distanceKm용. */
const EARTH_RADIUS_KM = 6371

/**
 * 두 좌표 간 거리(km) — equirectangular 근사.
 * 수 km 반경(룰렛 내 위치 3km 필터)에서는 하버사인과의 오차가 무시 가능하다.
 * 경도차는 두 위도의 중간값으로 보정해 기준점 밖 지역에서도 정확도를 유지.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad)
  return EARTH_RADIUS_KM * Math.sqrt(dLat * dLat + dLng * dLng)
}
