/**
 * 홈 / 식당 목록 페이지 (라우트: `/`) — 기획서 §8.1 + 목업 §01·§09·§11
 *
 * - 검색 입력 (식당 ~80건 규모라 debounce 불필요)
 * - sheet_type 토글 + 카테고리 chip + 정렬 SortPill
 * - 휴업·폐업 포함 토글
 * - PullToRefresh로 새로고침
 * - 빈 상태는 EmptyState (동적 텍스트 + 일러스트)
 * - 페이징: 10개 단위 클라이언트 슬라이싱 + "더보기" 버튼
 *   (server-side range()는 stats 뷰가 분리되어 sort+filter+range 통합이 어려움 →
 *    dba 통합 뷰 도입 시 server-side로 전환 가능. 현 80건 규모에선 네트워크 영향 미미.)
 * - 검색·시트타입·카테고리 chip 영역은 헤더 아래에 sticky 고정 (리스트만 스크롤).
 * - 우하단 "맨위로" 버튼 노출.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../components/layout/AppShell'
import { PullToRefresh } from '../components/layout/PullToRefresh'
import { CategoryChip } from '../components/restaurant/CategoryChip'
import { RestaurantCard } from '../components/restaurant/RestaurantCard'
import {
  SheetTypeToggle,
  type SheetTypeFilter,
} from '../components/restaurant/SheetTypeToggle'
import { SortPill } from '../components/ui/SortPill'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/empty/EmptyState'
import { restaurantsKeys, useRestaurants } from '../hooks/useRestaurants'
import { CATEGORIES, type Category } from '../types/domain'
import { isSupabaseConfigured } from '../lib/supabase'

type SortKey = 'score' | 'count' | 'name'

const SORT_OPTIONS = [
  { value: 'score' as const, label: '평점 높은 순' },
  { value: 'count' as const, label: '평가 많은 순' },
  { value: 'name' as const, label: '이름 가나다순' },
]

/** 페이지당 표시 카드 수 (기획서 §8.1, team-lead 지시) */
const PAGE_SIZE = 10

export default function HomePage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch, isFetching } =
    useRestaurants()

  const [keyword, setKeyword] = useState('')
  const [sheetType, setSheetType] = useState<SheetTypeFilter>('all')
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  /** "더보기"로 점진 노출되는 카드 수. 필터·정렬·검색 변경 시 초기 PAGE_SIZE로 리셋. */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const toggleCategory = (cat: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const missingTable = data?.missingTable ?? false

  const filtered = useMemo(() => {
    // `data?.data ?? []`을 useMemo 안에서 평가해야 매 렌더마다 새 빈 배열 참조가
    // 의존성으로 들어가 캐시를 무효화하는 문제가 사라진다 (react-hooks/exhaustive-deps).
    const list = data?.data ?? []
    const kw = keyword.trim().toLowerCase()
    return list.filter((r) => {
      if (!showInactive && r.status !== '운영중') return false
      if (sheetType !== 'all' && r.sheet_type !== sheetType) return false
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(r.category)
      ) {
        return false
      }
      if (kw) {
        const hay = `${r.name} ${r.menu ?? ''}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [data?.data, keyword, sheetType, selectedCategories, showInactive])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortKey === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    } else if (sortKey === 'count') {
      arr.sort((a, b) => {
        if (b.rating_count !== a.rating_count) {
          return b.rating_count - a.rating_count
        }
        const sa = a.avg_score ?? -1
        const sb = b.avg_score ?? -1
        return sb - sa
      })
    } else {
      arr.sort((a, b) => {
        const sa = a.avg_score ?? -1
        const sb = b.avg_score ?? -1
        if (sb !== sa) return sb - sa
        return b.rating_count - a.rating_count
      })
    }
    return arr
  }, [filtered, sortKey])

  // 검색/필터/정렬 변경 시 페이지를 첫 페이지로 리셋.
  // React 권장 패턴: effect 대신 "이전 값과 비교 후 렌더 중 setState"로 cascading render 방지.
  const filterKey = `${keyword}|${sheetType}|${selectedCategories.join(',')}|${showInactive}|${sortKey}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setVisibleCount(PAGE_SIZE)
  }

  const visible = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  )
  const hasMore = visible.length < sorted.length

  // "더보기" 자동 트리거 — 마지막 카드가 뷰포트에 들어오면 추가 로드 (모바일 무한 스크롤 느낌).
  // 사용자가 명시적 버튼을 선호할 수 있으므로 버튼도 함께 노출.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, sorted.length))
        }
      },
      { rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, sorted.length])

  // 우하단 "맨위로" 버튼 — 일정 이상 스크롤하면 노출.
  const [showScrollTop, setShowScrollTop] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <AppShell>
      <PullToRefresh
        onRefresh={async () => {
          await queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
        }}
      >
        {/* 검색~카테고리 chip까지 sticky 고정 (대메뉴까지 틀고정). 아래 리스트만 스크롤.
           헤더-검색창 간격을 좁히기 위해 main의 pt-4를 -mt-3으로 상쇄. */}
        <section className="sticky top-14 z-20 -mx-4 -mt-3 space-y-2 bg-white px-4 pb-2 pt-2">
          <label className="block">
            <span className="sr-only">식당 검색</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
                <Icon name="search" size={16} />
              </span>
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="식당명·메뉴 검색"
                className="w-full rounded-input border border-surface-border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-surface-muted"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <SheetTypeToggle value={sheetType} onChange={setSheetType} />
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-surface-border accent-brand-primary"
              />
              휴업·폐업 포함
            </label>
          </div>

          <div
            className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="카테고리 필터"
          >
            {CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat}
                label={cat}
                selected={selectedCategories.includes(cat)}
                onClick={() => toggleCategory(cat)}
                className="shrink-0"
              />
            ))}
          </div>
        </section>

        <section className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm text-ink-700">
              {isLoading ? (
                '식당 불러오는 중…'
              ) : (
                <>
                  총 <strong className="text-ink-900">{sorted.length}</strong>건
                  {hasMore && (
                    <span className="ml-1 text-xs text-ink-500">
                      ({visible.length}건 표시)
                    </span>
                  )}
                </>
              )}
              {!isLoading && isFetching && (
                <span className="ml-2 text-xs text-ink-500">새로 고침 중…</span>
              )}
            </h2>
            <SortPill
              value={sortKey}
              onChange={setSortKey}
              options={SORT_OPTIONS}
              ariaLabel="정렬"
            />
          </div>

          {isError && (
            <ErrorBox
              message={
                error instanceof Error ? error.message : '알 수 없는 오류'
              }
              onRetry={() => refetch()}
            />
          )}

          {!isError && !isLoading && sorted.length === 0 && (
            <HomeEmptyState
              configured={isSupabaseConfigured}
              missingTable={missingTable}
              keyword={keyword}
              hasFilters={
                selectedCategories.length > 0 || sheetType !== 'all'
              }
              onClearKeyword={() => setKeyword('')}
              onClearFilters={() => {
                setSelectedCategories([])
                setSheetType('all')
              }}
              onSuggestCategory={(c) => {
                setKeyword('')
                setSelectedCategories([c])
              }}
            />
          )}

          {isLoading && <SkeletonList />}

          {!isLoading && sorted.length > 0 && (
            <>
              <ul className="space-y-3">
                {visible.map((r) => (
                  <li key={r.id}>
                    <RestaurantCard restaurant={r} />
                  </li>
                ))}
              </ul>

              {hasMore && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {/* IntersectionObserver 센티넬 — 스크롤이 가까워지면 자동 로드 */}
                  <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((n) =>
                        Math.min(n + PAGE_SIZE, sorted.length),
                      )
                    }
                    className="rounded-button border border-surface-border bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  >
                    더보기 ({sorted.length - visible.length}건 남음)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </PullToRefresh>

      {/* 우하단 floating "맨위로" 버튼 — 일정 이상 스크롤하면 노출. BottomNav(z-30) 위로 가지 않도록 z-20. */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          aria-label="맨 위로"
          className="fixed bottom-20 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-white/70 text-ink-700 shadow-md backdrop-blur transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <span className="inline-flex" style={{ transform: 'rotate(180deg)' }}>
            <Icon name="chevron-down" size={20} />
          </span>
        </button>
      )}
    </AppShell>
  )
}

function SkeletonList() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="sk-shimmer h-28 rounded-card border border-surface-border"
        />
      ))}
    </ul>
  )
}

function ErrorBox({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-medium">식당 목록을 불러오지 못했어요.</p>
      <p className="mt-1 text-xs text-red-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-button border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        다시 시도
      </button>
    </div>
  )
}

function HomeEmptyState({
  configured,
  missingTable,
  keyword,
  hasFilters,
  onClearKeyword,
  onClearFilters,
  onSuggestCategory,
}: {
  configured: boolean
  missingTable: boolean
  keyword: string
  hasFilters: boolean
  onClearKeyword: () => void
  onClearFilters: () => void
  onSuggestCategory: (c: Category) => void
}) {
  if (!configured) {
    return (
      <div className="rounded-card border border-dashed border-surface-border bg-white p-6 text-center text-sm text-ink-500">
        <p className="font-medium text-ink-700">
          Supabase 환경변수가 설정되지 않았습니다.
        </p>
        <p className="mt-1 text-xs">
          .env에 <code>VITE_SUPABASE_URL</code> /{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>를 채워 주세요.
        </p>
      </div>
    )
  }
  if (missingTable) {
    return (
      <div className="rounded-card border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-800">
        <p className="font-medium">
          데이터베이스 마이그레이션이 아직 적용되지 않았어요.
        </p>
        <p className="mt-1 text-xs">
          관리자에게 <code>supabase/migrations</code> 적용을 요청해 주세요.
        </p>
      </div>
    )
  }
  if (keyword.trim()) {
    return (
      <EmptyState
        illust="search-empty"
        title="검색 결과가 없어요"
        description={
          <>
            <strong>"{keyword}"</strong>에 해당하는 식당이 없어요.
            <br />
            다른 키워드로 찾거나 새 식당을 등록해보세요.
          </>
        }
        primaryAction={{
          label: (
            <>
              <Icon name="plus" size={14} />
              <span>"{keyword}" 등록하기</span>
            </>
          ),
          href: '/add',
        }}
        secondaryAction={{
          label: '검색어 지우기',
          onClick: onClearKeyword,
        }}
        suggestChips={['한식', '일식', '중식'].map((c) => ({
          label: c,
          onClick: () => onSuggestCategory(c as Category),
        }))}
      />
    )
  }
  if (hasFilters) {
    return (
      <EmptyState
        illust="restaurants-empty"
        title="조건에 맞는 식당이 없어요"
        description="필터를 조금 줄여서 다시 보세요."
        primaryAction={{
          label: '필터 초기화',
          onClick: onClearFilters,
        }}
      />
    )
  }
  return (
    <EmptyState
      illust="restaurants-empty"
      title="아직 등록된 식당이 없어요"
      description="첫 맛집을 등록해 주세요."
      primaryAction={{
        label: (
          <>
            <Icon name="plus" size={14} />
            <span>맛집 등록</span>
          </>
        ),
        href: '/add',
      }}
    />
  )
}

