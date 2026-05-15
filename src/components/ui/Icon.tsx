/**
 * Lucide-style SVG 아이콘.
 *
 * 목업 §1688~1925의 path 데이터를 컴포넌트로 옮김.
 * 새 npm 의존성을 피하기 위해 외부 라이브러리(예: lucide-react) 대신
 * 인라인 SVG로 구현. 21개 미만의 정해진 셋만 노출.
 *
 * 사용:
 *   <Icon name="search" />
 *   <Icon name="plus" className="text-brand-primary" size={20} />
 *
 * - `currentColor`로 색을 받는다 → Tailwind `text-*` 클래스로 색 지정 가능.
 * - `size` (기본 16) 또는 `className`의 `w-*`/`h-*` 둘 다 지원.
 * - `aria-hidden`이 기본값 (장식용). label 필요 시 `title` prop.
 */

import type { SVGProps } from 'react'

export type IconName =
  | 'search'
  | 'plus'
  | 'more-h'
  | 'chevron-down'
  | 'chevron-left'
  | 'home'
  | 'dice'
  | 'map-pin'
  | 'pause'
  | 'trash'
  | 'star'
  | 'lightbulb'
  | 'alert'
  | 'info'
  | 'user'
  | 'pencil'
  | 'map'
  | 'refresh'
  | 'utensils'
  | 'sun'
  | 'moon'
  | 'check'
  | 'x'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number | string
  title?: string
}

export function Icon({
  name,
  size = 16,
  title,
  className,
  ...rest
}: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': title ? undefined : true,
    role: title ? 'img' : undefined,
    focusable: false as const,
    className,
    ...rest,
  }
  return (
    <svg {...common}>
      {title ? <title>{title}</title> : null}
      {renderIcon(name)}
    </svg>
  )
}

function renderIcon(name: IconName) {
  // 모든 path는 currentColor로 색을 받음 → 부모 text-* 클래스가 색을 좌우.
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'search':
      return (
        <g {...stroke}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </g>
      )
    case 'plus':
      return (
        <path
          d="M5 12h14M12 5v14"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      )
    case 'more-h':
      return (
        <g fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </g>
      )
    case 'chevron-down':
      return (
        <path
          d="m6 9 6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'chevron-left':
      return (
        <path
          d="m15 18-6-6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'home':
      return (
        <g {...stroke}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </g>
      )
    case 'dice':
      return (
        <>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
          <g fill="currentColor">
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="16" cy="8" r="1.3" />
            <circle cx="12" cy="12" r="1.3" />
            <circle cx="8" cy="16" r="1.3" />
            <circle cx="16" cy="16" r="1.3" />
          </g>
        </>
      )
    case 'map-pin':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 12 8 12s8-5.5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
        />
      )
    case 'pause':
      return (
        <g fill="currentColor">
          <rect x="6" y="5" width="3.5" height="14" rx="1" />
          <rect x="14.5" y="5" width="3.5" height="14" rx="1" />
        </g>
      )
    case 'trash':
      return (
        <g {...stroke}>
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </g>
      )
    case 'star':
      return (
        <path
          fill="currentColor"
          d="M12 2.5 14.9 8.4l6.5.95-4.7 4.6 1.1 6.45L12 17.3l-5.8 3.1 1.1-6.45L2.6 9.35l6.5-.95z"
        />
      )
    case 'lightbulb':
      return (
        <g {...stroke}>
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 1 0-12 0c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </g>
      )
    case 'alert':
      return (
        <g {...stroke}>
          <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </g>
      )
    case 'info':
      return (
        <g {...stroke}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </g>
      )
    case 'user':
      return (
        <g {...stroke}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </g>
      )
    case 'pencil':
      return (
        <g {...stroke}>
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
          <path d="m15 5 4 4" />
        </g>
      )
    case 'map':
      return (
        <g {...stroke}>
          <path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
          <path d="M9 3v15" />
          <path d="M15 6v15" />
        </g>
      )
    case 'refresh':
      return (
        <g {...stroke}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </g>
      )
    case 'utensils':
      return (
        <g {...stroke}>
          <path d="M3 2v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2" />
          <path d="M5 11v11" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2z" />
          <path d="M18 15v7" />
        </g>
      )
    case 'sun':
      return (
        <g {...stroke}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </g>
      )
    case 'moon':
      return (
        <path
          d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'check':
      return (
        <path
          d="m5 12 5 5L20 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'x':
      return (
        <path
          d="M18 6 6 18M6 6l12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )
    default:
      return null
  }
}
