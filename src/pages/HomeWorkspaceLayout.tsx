/**
 * 홈 워크스페이스 레이아웃 라우트 — `/` 와 `/restaurants/:id` 를 감싼다.
 *
 * 설계: doc/plan/2026-08-12-desktop-naver-layout-design.md
 * - 모바일(<1024px): `<Outlet/>`만 렌더 → 기존 HomePage / RestaurantDetailPage 그대로.
 * - 데스크톱(≥1024px): 네이버 지도 포맷 워크스페이스.
 *     [SideRail 64px | 리스트 패널 400px | (상세 패널 400px = Outlet) | 지도 flex-1]
 *   두 라우트가 같은 레이아웃 아래 있어 상세 패널이 열리고 닫혀도
 *   지도·목록이 언마운트되지 않는다 (카카오맵 재로딩·필터 상태 소실 방지).
 *
 * 필터 상태(useRestaurantFilters)는 이 레이아웃이 소유 — 리스트 패널과
 * 지도 마커가 같은 필터 결과를 공유한다.
 */

import { Suspense, useMemo } from 'react'
import { Outlet, useMatch, useNavigate } from 'react-router-dom'
import { SideRail } from '../components/layout/SideRail'
import { KakaoMapView } from '../components/map/KakaoMapView'
import { RestaurantListPanel } from '../components/restaurant/RestaurantListPanel'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useRestaurants } from '../hooks/useRestaurants'
import { useRestaurantFilters } from '../hooks/useRestaurantFilters'
import { NAMBU_TERMINAL_STATION, YANGJAE_STATION } from '../lib/kakao'

export default function HomeWorkspaceLayout() {
  // lg 미만에서는 카카오 SDK·워크스페이스가 아예 마운트되지 않아야 한다
  // (CSS hidden이 아니라 조건부 렌더 — useMediaQuery 훅의 존재 이유).
  const isWide = useMediaQuery('(min-width: 1024px)')
  if (!isWide) return <Outlet />
  return <DesktopWorkspace />
}

function DesktopWorkspace() {
  const navigate = useNavigate()
  // `/restaurants/:id`에 있으면 해당 식당이 선택 상태 (지도 센터링 + 상세 패널).
  const detailMatch = useMatch('/restaurants/:id')
  const selectedId = detailMatch?.params.id ?? null

  const { data, isLoading, isError, error, refetch, isFetching } =
    useRestaurants()
  const filters = useRestaurantFilters(data?.data)

  // 상세 패널이 열린 상태에서 지역 토글을 누르면 패널을 닫고
  // 해당 지역 지도(역 센터 + 지역 핀 전체)로 전환한다.
  const panelFilters: typeof filters = {
    ...filters,
    setRegion: (next) => {
      filters.setRegion(next)
      if (selectedId) navigate('/')
    },
  }

  // 지도 마커:
  // - 선택 없음(`/`): 페이지네이션(visible)과 무관하게 "필터·정렬된 전체"를 표시.
  // - 식당 선택(`/restaurants/:id`): 해당 식당 핀 1개만 표시.
  //   필터에 걸러진 식당으로 직접 진입해도 핀이 보이도록 전체 목록(data)에서 찾는다.
  const mapMarkers = useMemo(() => {
    if (selectedId) {
      const r = (data?.data ?? []).find((x) => x.id === selectedId)
      return r && r.lat !== null && r.lng !== null
        ? [{ id: r.id, lat: r.lat, lng: r.lng, title: r.name }]
        : []
    }
    return filters.sorted
      .filter((r) => r.lat !== null && r.lng !== null)
      .map((r) => ({
        id: r.id,
        lat: r.lat as number,
        lng: r.lng as number,
        title: r.name,
      }))
  }, [selectedId, data?.data, filters.sorted])

  return (
    <div className="flex h-dvh overflow-hidden bg-white pl-16">
      <SideRail />

      <RestaurantListPanel
        filters={panelFilters}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : '알 수 없는 오류'}
        isFetching={isFetching}
        missingTable={data?.missingTable ?? false}
        onRetry={() => refetch()}
      />

      {/* 상세 패널 슬롯 — `/`에서는 빈 콘텐츠(null), `/restaurants/:id`에서 패널.
         패널 lazy 청크 로딩이 상위 Suspense로 전파되어 지도·목록까지
         fallback으로 대체되지 않도록 여기서 경계를 끊는다. */}
      <Suspense
        fallback={
          <div className="w-[400px] shrink-0 border-r border-surface-border bg-white p-4">
            <div className="sk-shimmer h-8 w-2/3 rounded" />
          </div>
        }
      >
        <Outlet />
      </Suspense>

      {/* 지도 — 남는 영역 전체. center를 항상 넘겨 좌표 0건이어도 지도는 렌더.
         지역 토글 선택 시 해당 역(양재역/남부터미널역)으로 센터 이동 —
         '전체'는 양재역 기준 유지. 식당 선택 중에는 selectedId 센터링이 우선. */}
      <main className="relative min-w-0 flex-1 bg-surface-muted">
        <KakaoMapView
          markers={mapMarkers}
          center={
            filters.region === '남부터미널'
              ? NAMBU_TERMINAL_STATION
              : YANGJAE_STATION
          }
          selectedId={selectedId}
          onMarkerClick={(id) => navigate(`/restaurants/${id}`)}
          className="h-full w-full"
        />
      </main>
    </div>
  )
}
