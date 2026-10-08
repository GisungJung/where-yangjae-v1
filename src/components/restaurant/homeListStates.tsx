/**
 * 홈 식당 목록의 상태 컴포넌트 모음 — 스켈레톤 / 에러 / 빈 상태.
 *
 * HomePage(모바일)와 RestaurantListPanel(데스크톱 워크스페이스)이 공유한다.
 * 마크업은 기존 HomePage 내부 구현을 그대로 이동.
 */

import { EmptyState } from '@/components/empty/EmptyState'
import { Icon } from '@/components/ui/Icon'
import type { Category } from '@/types/domain'

export function SkeletonList() {
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

export function ErrorBox({
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

export function HomeEmptyState({
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
          관리자에게 DB 스키마(<code>doc/db/schema.sql</code>) 적용을 요청해 주세요.
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
