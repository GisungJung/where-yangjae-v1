/**
 * 라우트 정의
 *
 * 기획서 §9의 라우트 표 기준.
 * - 홈 / 룰렛 / 등록 / 상세 / 404
 * - 평가 입력은 상세 페이지 내 인라인 폼으로 흡수 (기획서 §8.3)
 *
 * 전역 ErrorBoundary가 모든 페이지를 감싼다 (기획서 §11.2).
 */

import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/error/ErrorBoundary'

const HomePage = lazy(() => import('./pages/HomePage'))
const RestaurantDetailPage = lazy(
  () => import('./pages/RestaurantDetailPage'),
)
const RoulettePage = lazy(() => import('./pages/RoulettePage'))
const AddRestaurantPage = lazy(() => import('./pages/AddRestaurantPage'))
const EditRestaurantPage = lazy(() => import('./pages/EditRestaurantPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

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
          <Route path="/" element={<HomePage />} />
          <Route path="/restaurants/:id" element={<RestaurantDetailPage />} />
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
