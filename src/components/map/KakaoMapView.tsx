/**
 * 카카오맵 임베드 컴포넌트.
 *
 * - 모드 A (단일 핀): `markers`에 1개만 전달 → 상세 페이지에서 사용.
 * - 모드 B (다수 핀): 홈 화면에서 식당 리스트를 지도에 표시.
 *
 * 좌표 없는 항목은 자동 skip. 좌표가 하나도 없으면 회색 안내 박스로 폴백.
 *
 * 콜백 stale closure 회피: `onMarkerClick`을 `useRef`로 최신화하고
 * 마커 이벤트 핸들러는 ref.current()를 호출한다. 덕분에 의존성 배열에
 * 콜백을 넣지 않아도 항상 최신 함수가 실행되며, 부모 리렌더에 의한
 * 지도 재초기화가 발생하지 않는다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KakaoMap, KakaoMarker } from '../../lib/kakao'
import { loadKakaoMaps, YANGJAE_STATION } from '../../lib/kakao'

export interface KakaoMarkerData {
  id: string
  lat: number
  lng: number
  title?: string
}

interface Props {
  markers: KakaoMarkerData[]
  /** 단일 핀 모드의 중심 좌표 보조 (없으면 첫 마커 기준) */
  center?: { lat: number; lng: number }
  level?: number
  className?: string
  /** 마커 클릭 시 식당 id 반환 (홈 지도에서 사용) */
  onMarkerClick?: (id: string) => void
}

export function KakaoMapView({
  markers,
  center,
  level = 4,
  className,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markerRefs = useRef<KakaoMarker[]>([])
  const [error, setError] = useState<string | null>(null)

  // 콜백을 ref에 보관해 useEffect 의존성에서 제외 → stale closure 차단.
  const onMarkerClickRef = useRef<typeof onMarkerClick>(onMarkerClick)
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick
  }, [onMarkerClick])

  const validMarkers = useMemo(
    () =>
      markers.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng),
      ),
    [markers],
  )
  const fallbackCenter =
    center ??
    validMarkers[0] ??
    // 기본 중심: 양재역
    { lat: YANGJAE_STATION.lat, lng: YANGJAE_STATION.lng }

  // 좌표 의미가 같은데 객체 참조만 달라져 effect가 재실행되지 않도록 키 생성.
  const markersKey = useMemo(
    () => validMarkers.map((m) => `${m.id}:${m.lat},${m.lng}`).join('|'),
    [validMarkers],
  )

  useEffect(() => {
    let cancelled = false
    if (!containerRef.current) return

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: new maps.LatLng(fallbackCenter.lat, fallbackCenter.lng),
            level,
          })
        } else {
          mapRef.current.setCenter(
            new maps.LatLng(fallbackCenter.lat, fallbackCenter.lng),
          )
          mapRef.current.setLevel(level)
        }

        // 기존 마커 제거
        for (const m of markerRefs.current) m.setMap(null)
        markerRefs.current = []

        // 마커 추가
        for (const data of validMarkers) {
          const marker = new maps.Marker({
            position: new maps.LatLng(data.lat, data.lng),
            map: mapRef.current,
          })
          markerRefs.current.push(marker)

          // 카카오 SDK의 event 네임스페이스는 타입 stub에 없으므로 캐스팅.
          const kakaoEvent = (
            window.kakao as unknown as {
              maps: {
                event: {
                  addListener: (
                    target: unknown,
                    type: string,
                    handler: () => void,
                  ) => void
                }
              }
            }
          ).maps.event
          kakaoEvent.addListener(marker, 'click', () => {
            onMarkerClickRef.current?.(data.id)
          })
        }

        mapRef.current.relayout()
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [markersKey, fallbackCenter.lat, fallbackCenter.lng, level, validMarkers])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-card bg-surface-muted p-4 text-sm text-ink-500 ${className ?? ''}`}
      >
        지도를 불러올 수 없습니다. ({error})
      </div>
    )
  }

  if (validMarkers.length === 0 && !center) {
    return (
      <div
        className={`flex items-center justify-center rounded-card bg-surface-muted p-4 text-sm text-ink-500 ${className ?? ''}`}
      >
        표시할 좌표가 없습니다.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`kakao-map ${className ?? ''}`}
      aria-label="카카오맵"
    />
  )
}
