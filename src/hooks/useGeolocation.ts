/**
 * 브라우저 Geolocation 1회 조회 훅.
 *
 * 마운트 시 현재 위치를 요청한다 — 권한 프롬프트는 브라우저가 처리하고,
 * 이미 허용된 사용자는 프롬프트 없이 바로 좌표를 받는다.
 * 거부·미지원·타임아웃은 전부 'unavailable'로 수렴 — 호출부는 위치 없이
 * 동작하는 폴백(전체 조회)을 가져야 한다.
 *
 * 사용처: 룰렛(내 위치 3km 후보 필터).
 */

import { useEffect, useState } from 'react'

export interface GeoPoint {
  lat: number
  lng: number
}

export type GeolocationStatus = 'loading' | 'granted' | 'unavailable'

/** 브라우저가 Geolocation API를 지원하는지 — 초기 state 결정용. */
function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

export function useGeolocation(): {
  status: GeolocationStatus
  coords: GeoPoint | null
} {
  // 미지원 판정은 렌더 전에 확정 가능 — effect 내 동기 setState 회피.
  const [status, setStatus] = useState<GeolocationStatus>(() =>
    isGeolocationSupported() ? 'loading' : 'unavailable',
  )
  const [coords, setCoords] = useState<GeoPoint | null>(null)

  useEffect(() => {
    if (!isGeolocationSupported()) return
    let mounted = true
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted) return
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      () => {
        if (mounted) setStatus('unavailable')
      },
      // 정밀 GPS 불필요(3km 반경 판단) — 배터리 아끼고 5분 캐시 허용.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
    return () => {
      mounted = false
    }
  }, [])

  return { status, coords }
}
