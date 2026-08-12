/**
 * 라우트 정의
 *
 * 기획서 §9의 라우트 표 기준.
 * - 홈 / 룰렛 / 등록 / 상세 / 404
 * - 평가 입력은 상세 페이지 내 인라인 폼으로 흡수 (기획서 §8.3)
 * - `/`와 `/restaurants/:id`는 HomeWorkspaceLayout(공유 레이아웃)로 묶임:
 *   데스크톱(≥1024px)에서 상세가 패널로 열려도 지도·목록이 언마운트되지 않는다.
 *   모바일에서는 레이아웃이 Outlet만 렌더하므로 기존 페이지 그대로.
 *
 * 전역 ErrorBoundary가 모든 페이지를 감싼다 (기획서 §11.2).
 */

import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/error/ErrorBoundary'
import { useMediaQuery } from './hooks/useMediaQuery'

const HomePage = lazy(() => import('./pages/HomePage'))
const HomeWorkspaceLayout = lazy(() => import('./pages/HomeWorkspaceLayout'))
const RestaurantDetailPage = lazy(
  () => import('./pages/RestaurantDetailPage'),
)
const RoulettePage = lazy(() => import('./pages/RoulettePage'))
const AddRestaurantPage = lazy(() => import('./pages/AddRestaurantPage'))
const EditRestaurantPage = lazy(() => import('./pages/EditRestaurantPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// 상세 패널은 워크스페이스와 함께 쓰이므로 같은 청크로 (lazy 중첩 최소화).
const RestaurantDetailPanel = lazy(() =>
  import('./components/restaurant/RestaurantDetailPanel').then((m) => ({
    default: m.RestaurantDetailPanel,
  })),
)

const WIDE_QUERY = '(min-width: 1024px)'

/** `/` — 데스크톱: 상세 패널 슬롯 비움(null) / 모바일: 기존 HomePage */
function HomeIndexRoute() {
  const isWide = useMediaQuery(WIDE_QUERY)
  return isWide ? null : <HomePage />
}

/** `/restaurants/:id` — 데스크톱: 패널 / 모바일: 기존 상세 페이지 */
function RestaurantDetailRoute() {
  const isWide = useMediaQuery(WIDE_QUERY)
  return isWide ? <RestaurantDetailPanel /> : <RestaurantDetailPage />
}

function RouteFallback() {
  return (
    <div className="mx-auto max-w-screen-md p-6 text-sm text-ink-500">
      불러오는 중…
    </div>
  )
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<HomeWorkspaceLayout />}>
            <Route index element={<HomeIndexRoute />} />
            <Route
              path="/restaurants/:id"
              element={<RestaurantDetailRoute />}
            />
          </Route>
          <Route
            path="/restaurants/:id/edit"
            element={<EditRestaurantPage />}
          />
          <Route path="/roulette" element={<RoulettePage />} />
          <Route path="/add" element={<AddRestaurantPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
