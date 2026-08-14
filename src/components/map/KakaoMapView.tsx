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
  /** 선택된 식당 id — 지정 시 해당 마커로 센터 이동 (데스크톱 상세 패널 연동) */
  selectedId?: string | null
}

/** 선택 마커 센터링 시 확대 레벨 (상세 페이지 단일 핀과 동일 체감) */
const SELECTED_LEVEL = 3

export function KakaoMapView({
  markers,
  center,
  level = 4,
  className,
  onMarkerClick,
  selectedId = null,
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

  // selectedId도 ref로 보관 — 지도 초기화(비동기) 완료 시점에 최신 선택값을 반영하고,
  // 값 변경만으로 마커 전체가 재생성되는 것을 막는다.
  const selectedIdRef = useRef<string | null>(selectedId)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

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

        // 브랜드 커스텀 핀 (시안 A — 밥그릇 핀). anchor는 핀 끝점(하단 중앙).
        const defaultImage = new maps.MarkerImage(
          '/pin.svg',
          new maps.Size(30, 40),
          { offset: new maps.Point(15, 38) },
        )
        const selectedImage = new maps.MarkerImage(
          '/pin-selected.svg',
          new maps.Size(44, 58),
          { offset: new maps.Point(22, 56) },
        )

        // 마커 추가 — 선택 식당은 진한색+확대 핀, zIndex 상향.
        for (const data of validMarkers) {
          const isSelected = data.id === selectedIdRef.current
          const marker = new maps.Marker({
            position: new maps.LatLng(data.lat, data.lng),
            map: mapRef.current,
            image: isSelected ? selectedImage : defaultImage,
            zIndex: isSelected ? 10 : 1,
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

        // 초기화 완료 시점에 선택 식당이 이미 있으면(직접 URL 진입 등) 센터링.
        const sel = selectedIdRef.current
        const target = sel ? validMarkers.find((m) => m.id === sel) : null
        if (target) {
          mapRef.current.setCenter(new maps.LatLng(target.lat, target.lng))
          mapRef.current.setLevel(SELECTED_LEVEL)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [markersKey, fallbackCenter.lat, fallbackCenter.lng, level, validMarkers])

  // 선택 변경 시 해당 마커로 센터 이동 (마커 재생성 없이 지도만 이동).
  useEffect(() => {
    if (!selectedId) return
    const map = mapRef.current
    const maps = window.kakao?.maps
    if (!map || !maps) return
    const target = validMarkers.find((m) => m.id === selectedId)
    if (!target) return
    map.setCenter(new maps.LatLng(target.lat, target.lng))
    map.setLevel(SELECTED_LEVEL)
    // validMarkers는 markersKey로 갈음 (좌표 동일하면 재실행 불필요).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, markersKey])

  // 컨테이너 크기 변화(상세 패널 열림/닫힘 등) 시 카카오맵 relayout.
  // 지도 div는 error·좌표없음 폴백이 아닐 때만 렌더되므로 그 조건을 의존성으로 부착.
  const showMap = !error && (validMarkers.length > 0 || Boolean(center))
  useEffect(() => {
    if (!showMap) return
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      mapRef.current?.relayout()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [showMap])

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
