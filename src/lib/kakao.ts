/**
 * Kakao Maps SDK 로더
 *
 * - JS Key는 `.env`의 `VITE_KAKAO_MAP_KEY`에서 읽는다.
 * - SDK는 `autoload=false`로 로드한 뒤 `kakao.maps.load()`로 명시 초기화.
 * - 다중 호출 시 Promise를 캐싱해 1회만 스크립트 태그를 추가한다.
 * - SSR 무관(이 프로젝트는 Vite SPA). 다만 `window` 가드는 안전을 위해 유지.
 */

type KakaoMaps = {
  load: (callback: () => void) => void
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap
  Marker: new (options: KakaoMarkerOptions) => KakaoMarker
  LatLng: new (lat: number, lng: number) => KakaoLatLng
  services?: {
    Places: new () => KakaoPlaces
    Geocoder: new () => KakaoGeocoder
    Status: { OK: 'OK'; ZERO_RESULT: 'ZERO_RESULT'; ERROR: 'ERROR' }
  }
}

export type KakaoLatLng = { getLat(): number; getLng(): number }
export type KakaoMap = {
  setCenter(latlng: KakaoLatLng): void
  setLevel(level: number): void
  relayout(): void
}
export type KakaoMarker = {
  setMap(map: KakaoMap | null): void
  setPosition(latlng: KakaoLatLng): void
}
export type KakaoMapOptions = { center: KakaoLatLng; level?: number }
export type KakaoMarkerOptions = { position: KakaoLatLng; map?: KakaoMap }

export type KakaoPlaceSearchResult = {
  id: string
  place_name: string
  address_name: string
  road_address_name?: string
  category_name?: string
  x: string // lng
  y: string // lat
}
type KakaoPlaces = {
  keywordSearch: (
    keyword: string,
    callback: (
      data: KakaoPlaceSearchResult[],
      status: 'OK' | 'ZERO_RESULT' | 'ERROR',
    ) => void,
  ) => void
}
type KakaoGeocoder = unknown

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

const KAKAO_SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js'

/**
 * 양재역 좌표 — 사내 컨텍스트 기준 지도 fallback 중심.
 * 사용처: `KakaoMapView` 좌표가 전혀 없을 때의 기본 중심값.
 */
export const YANGJAE_STATION = { lat: 37.4837, lng: 127.0359 } as const

let loaderPromise: Promise<KakaoMaps> | null = null

/** Kakao Maps SDK를 1회만 로드하고 `kakao.maps` 네임스페이스를 반환. */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kakao Maps SDK는 브라우저에서만 동작합니다.'))
  }

  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao.maps)
  }

  if (loaderPromise) return loaderPromise

  const appKey = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
  if (!appKey) {
    return Promise.reject(
      new Error('VITE_KAKAO_MAP_KEY가 설정되지 않았습니다. .env를 확인해 주세요.'),
    )
  }

  loaderPromise = new Promise<KakaoMaps>((resolve, reject) => {
    // 이미 같은 src로 들어간 스크립트가 있으면 재사용
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-kakao-sdk="true"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => onReady(resolve, reject), {
        once: true,
      })
      existing.addEventListener(
        'error',
        () => reject(new Error('Kakao Maps SDK 스크립트 로드 실패')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = `${KAKAO_SDK_URL}?appkey=${appKey}&autoload=false&libraries=services`
    script.async = true
    script.defer = true
    script.dataset.kakaoSdk = 'true'
    script.onload = () => onReady(resolve, reject)
    script.onerror = () => {
      loaderPromise = null
      reject(new Error('Kakao Maps SDK 스크립트 로드 실패'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}

function onReady(
  resolve: (maps: KakaoMaps) => void,
  reject: (err: Error) => void,
) {
  const maps = window.kakao?.maps
  if (!maps) {
    loaderPromise = null
    reject(new Error('window.kakao.maps가 초기화되지 않았습니다.'))
    return
  }
  maps.load(() => resolve(maps))
}

/**
 * 카카오 키워드 검색.
 *
 * - SDK의 `services.Places`를 사용 (JS Key로 동작 — REST Key 불필요).
 * - 결과는 최대 15건. 기획서 §8.4에 따라 호출부에서 상위 5개만 표시.
 * - SDK가 `services` 라이브러리 없이 로드된 경우 명확한 에러를 던진다.
 */
export async function searchKakaoPlaces(
  keyword: string,
): Promise<KakaoPlaceSearchResult[]> {
  const q = keyword.trim()
  if (!q) return []

  const maps = await loadKakaoMaps()
  const Places = maps.services?.Places
  const Status = maps.services?.Status
  if (!Places || !Status) {
    throw new Error('Kakao services 라이브러리가 로드되지 않았습니다.')
  }

  return new Promise<KakaoPlaceSearchResult[]>((resolve, reject) => {
    const places = new Places()
    places.keywordSearch(q, (data, status) => {
      if (status === Status.OK) {
        resolve(data)
      } else if (status === Status.ZERO_RESULT) {
        resolve([])
      } else {
        reject(new Error('카카오 장소 검색에 실패했어요.'))
      }
    })
  })
}
