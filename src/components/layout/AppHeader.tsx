/**
 * 모바일 우선 글로벌 헤더.
 *
 * 기본(홈): [로고+서비스명]              [양재역·사내]
 * 비-홈 기본: [‹ 홈]                     [양재역·사내]
 *
 * 페이지가 `title` prop을 명시하면 목업 §02 패턴:
 *   [‹]   [중앙 title (truncate)]   [rightAction]
 *
 * 사용 — AppShell이 헤더를 렌더하지만, 상세처럼 title이 필요한 페이지는
 * AppShell에 `header` prop으로 커스텀 헤더를 주입하거나
 * AppShell 안의 기본 AppHeader 대신 페이지 단에서 자체 헤더를 그릴 수 있다.
 */

import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../ui/Icon'

interface AppHeaderProps {
  /** 중앙에 표시될 제목. 지정 시 목업 §02 레이아웃으로 강제. */
  title?: string
  /** 헤더 우측 액션 슬롯 (예: 더보기 버튼). title과 함께 사용. */
  rightAction?: ReactNode
  /** 뒤로가기 링크 — 기본 '/'. */
  backTo?: string
}

export function AppHeader({
  title,
  rightAction,
  backTo = '/',
}: AppHeaderProps = {}) {
  const location = useLocation()
  const isHome = location.pathname === '/'

  // title이 주어지면 무조건 목업 §02 (중앙 정렬) 레이아웃.
  if (title) {
    return (
      <header className="fixed inset-x-0 top-0 z-30 border-b border-surface-border bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-2 px-4">
          <Link
            to={backTo}
            aria-label="뒤로"
            className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-button text-ink-900 hover:bg-surface-muted"
          >
            <Icon name="chevron-left" size={22} />
          </Link>
          <h1
            className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-ink-900"
            title={title}
          >
            {title}
          </h1>
          <div className="flex h-8 w-8 shrink-0 items-center justify-end">
            {rightAction ?? null}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-surface-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between gap-2 px-4">
        {!isHome ? (
          <Link
            to={backTo}
            className="-ml-1 flex items-center gap-0.5 rounded-button px-1 py-1 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            aria-label="홈으로"
          >
            <Icon name="chevron-left" size={20} />
            <span>홈</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-white"
              aria-hidden
            >
              <span className="text-base">y</span>
            </span>
            <Link to="/" className="text-base font-bold text-ink-900">
              양재어디가
            </Link>
          </div>
        )}

        <div className="text-xs text-ink-500">양재역 · 사내</div>
      </div>
    </header>
  )
}
