/**
 * 식당 목록 필터·정렬·페이징 상태 훅.
 *
 * HomePage(모바일)와 RestaurantListPanel(데스크톱 워크스페이스)이 공유한다.
 * 로직은 기존 HomePage 구현을 그대로 추출 — 계약은 useRestaurantFilters.test.tsx 참고.
 *
 * - 휴업·폐업은 기본 제외 (showInactive로 포함)
 * - 검색은 이름+메뉴 (식당 ~80건 규모라 debounce 불필요)
 * - 필터·정렬·검색 변경 시 visibleCount를 PAGE_SIZE로 리셋
 *   (React 권장 패턴: effect 대신 "이전 값과 비교 후 렌더 중 setState"로 cascading render 방지)
 */

import { useMemo, useState } from 'react'
import type { Category, RestaurantWithStats } from '@/types/domain'
import type { SheetTypeFilter } from '@/components/restaurant/SheetTypeToggle'

export type SortKey = 'score' | 'count' | 'visits' | 'name'

export const SORT_OPTIONS = [
  { value: 'score' as const, label: '평점 높은 순' },
  { value: 'count' as const, label: '평가 많은 순' },
  // 2026-10-08 방문 체크인 — 최근 7일 방문 → 누적 방문 → 평점
  { value: 'visits' as const, label: '요즘 많이 가는 순' },
  { value: 'name' as const, label: '이름 가나다순' },
]

/** 페이지당 표시 카드 수 (기획서 §8.1, team-lead 지시) */
export const PAGE_SIZE = 10

/** list가 undefined일 때 매 렌더 새 [] 참조로 memo가 무효화되지 않도록 모듈 상수 사용 */
const EMPTY: RestaurantWithStats[] = []

export function useRestaurantFilters(
  list: RestaurantWithStats[] | undefined,
) {
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

  const safeList = list ?? EMPTY

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return safeList.filter((r) => {
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
  }, [safeList, keyword, sheetType, selectedCategories, showInactive])

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
    } else if (sortKey === 'visits') {
      arr.sort(
        (a, b) =>
          b.visits_7d - a.visits_7d ||
          b.visits_total - a.visits_total ||
          (b.avg_score ?? -1) - (a.avg_score ?? -1),
      )
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

  // 검색/필터/정렬 변경 시 페이지를 첫 페이지로 리셋 (렌더 중 비교 후 setState).
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

  const loadMore = () => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, sorted.length))
  }

  /** EmptyState "필터 초기화" — 검색어는 별도 유지 (기존 HomePage 동작과 동일) */
  const clearFilters = () => {
    setSelectedCategories([])
    setSheetType('all')
  }

  return {
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
  }
}

export type RestaurantFilters = ReturnType<typeof useRestaurantFilters>
