/**
 * 주요 네비게이션 항목 — BottomNav(모바일)와 SideRail(데스크톱)이 공유.
 *
 * 활성 판단은 `useLocation().pathname`을 받아 각 항목이 직접 처리.
 * `/restaurants/...`는 홈 탭으로 인식 (상세·수정 진입 경로가 홈이므로).
 */

import type { IconName } from '../ui/Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  isActive: (pathname: string) => boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: '홈',
    icon: 'home',
    isActive: (p) => p === '/' || p.startsWith('/restaurants'),
  },
  {
    to: '/roulette',
    label: '오늘 뭐먹지',
    icon: 'dice',
    isActive: (p) => p.startsWith('/roulette'),
  },
  {
    to: '/add',
    label: '등록',
    icon: 'plus',
    isActive: (p) => p.startsWith('/add'),
  },
]
