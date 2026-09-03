/**
 * 데스크톱 워크스페이스 좌측 리스트 패널 (네이버 지도 포맷) — 목업 참고: 설계 문서
 * `doc/plan/features/2026-08-12-desktop-naver-layout-design.md` §2.
 *
 * - 폭 400px 고정, 세로 flex: 상단(검색·필터·정렬) 고정 + 목록만 내부 스크롤.
 * - 필터 상태(useRestaurantFilters)는 HomeWorkspaceLayout이 소유 — 지도 마커와 공유.
 * - 목록 UI(카드·페이징·빈 상태)는 모바일 HomePage와 동일 구성 요소를 재사용.
 */

import { useEffect, useRef } from 'react'
import { CategoryChip } from './CategoryChip'
import { RestaurantCard } from './RestaurantCard'
import { SheetTypeToggle } from './SheetTypeToggle'
import { ErrorBox, HomeEmptyState, SkeletonList } from './homeListStates'
import { SortPill } from '../ui/SortPill'
import { Icon } from '../ui/Icon'
import {
  SORT_OPTIONS,
  type RestaurantFilters,
} from '../../hooks/useRestaurantFilters'
import { CATEGORIES } from '../../types/domain'
import { isSupabaseConfigured } from '../../lib/supabase'

interface Props {
  filters: RestaurantFilters
  isLoading: boolean
  isError: boolean
  errorMessage: string
  isFetching: boolean
  missingTable: boolean
  onRetry: () => void
}

export function RestaurantListPanel({
  filters,
  isLoading,
  isError,
  errorMessage,
  isFetching,
  missingTable,
  onRetry,
}: Props) {
  const {
    keyword,
    setKeyword,
    sheetType,
    setSheetType,
    selectedCategories,
    setSelectedCategories,
    toggleCategory,
    showInactive,
    setShowInactive,
    sortKey,
    setSortKey,
    sorted,
    visible,
    hasMore,
    loadMore,
    clearFilters,
  } = filters

  // "더보기" 자동 트리거 — 패널 내부 스크롤 컨테이너를 root로 하는 IntersectionObserver.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    const root = scrollRef.current
    if (!el || !root) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore()
        }
      },
      { root, rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // loadMore는 매 렌더 새 참조지만 hasMore/sorted.length가 실질 트리거라 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, sorted.length])

  return (
    <section
      aria-label="식당 목록"
      className="flex h-full w-[400px] shrink-0 flex-col border-r border-surface-border bg-white"
    >
      {/* 상단 고정: 검색 + 필터 + 정렬 */}
      <div className="space-y-2 border-b border-surface-border px-4 pb-3 pt-4">
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
          className="flex flex-wrap gap-1.5"
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

        <div className="flex items-center justify-between pt-1">
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
      </div>

      {/* 목록 스크롤 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {isError && <ErrorBox message={errorMessage} onRetry={onRetry} />}

        {!isError && !isLoading && sorted.length === 0 && (
          <HomeEmptyState
            configured={isSupabaseConfigured}
            missingTable={missingTable}
            keyword={keyword}
            hasFilters={
              selectedCategories.length > 0 || sheetType !== 'all'
            }
            onClearKeyword={() => setKeyword('')}
            onClearFilters={clearFilters}
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
                <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
                <button
                  type="button"
                  onClick={loadMore}
                  className="rounded-button border border-surface-border bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  더보기 ({sorted.length - visible.length}건 남음)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
