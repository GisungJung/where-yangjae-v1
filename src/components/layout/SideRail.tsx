/**
 * 데스크톱(lg≥1024px) 좌측 아이콘 레일 — 네이버 지도 포맷.
 *
 * 상단 로고 + 홈/오늘뭐먹지/등록 세로 네비. 모바일에서는 렌더되지 않고
 * BottomNav가 같은 항목(navItems)을 담당한다.
 *
 * z-40: 홈 워크스페이스에서 지도·패널 위에 항상 보이도록 AppHeader(z-30)보다 위.
 */

import { Link, useLocation } from 'react-router-dom'
import { classNames } from '../../utils/format'
import { Icon } from '../ui/Icon'
import { NAV_ITEMS } from './navItems'

export function SideRail() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r border-surface-border bg-white lg:flex"
    >
      <Link
        to="/"
        aria-label="양재어디가 홈"
        className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-accent text-white"
      >
        <span className="text-lg font-bold">y</span>
      </Link>

      <ul className="mt-4 flex w-full flex-col items-stretch gap-1 px-1.5">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname)
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={classNames(
                  'flex flex-col items-center justify-center gap-1 rounded-button py-2.5 text-[10px]',
                  active
                    ? 'bg-brand-primary-soft text-brand-primary'
                    : 'text-ink-500 hover:bg-surface-muted hover:text-ink-700',
                )}
              >
                <Icon name={item.icon} size={20} />
                <span className="font-medium leading-none">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
