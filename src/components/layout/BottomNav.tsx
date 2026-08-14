/**
 * 모바일 하단 탭 네비게이션.
 *
 * 라우트: 홈 / 룰렛 / 등록 (navItems 공용 상수 — SideRail과 공유)
 * - 데스크톱(lg≥1024px)에서는 SideRail이 대신하므로 숨긴다.
 * - AppShell의 main에 `pb-24`를 줘서 하단 탭과 콘텐츠가 겹치지 않게 한다.
 * - 활성 판단은 `useLocation()`으로 직접 처리. `/restaurants/...`도 홈 탭으로 인식.
 * - 아이콘: 목업 §1688~1925의 Lucide-style SVG sprite를 컴포넌트로.
 */

import { Link, useLocation } from 'react-router-dom'
import { classNames } from '../../utils/format'
import { Icon } from '../ui/Icon'
import { NAV_ITEMS } from './navItems'

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden"
    >
      <ul className="mx-auto flex max-w-screen-md items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname)
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={classNames(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
                  active
                    ? 'text-brand-primary'
                    : 'text-ink-500 hover:text-ink-700',
                )}
              >
                <Icon name={item.icon} size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
