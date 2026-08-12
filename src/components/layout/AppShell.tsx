/**
 * 모든 페이지를 감싸는 공통 셸.
 *
 * 모바일 우선: 폭 max-w-screen-md(=768px)로 클램프, 좌우 패딩 16px.
 * BottomNav가 화면 하단에 고정되므로 main에 pb-24를 줘 콘텐츠 겹침을 막는다.
 *
 * - `header` prop을 주면 기본 AppHeader 대신 그것을 렌더 (목업 §02 title 헤더 등 페이지 전용).
 */

import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'

interface Props {
  children: ReactNode
  /** 커스텀 헤더 노드 (예: <AppHeader title="..." rightAction={...} />). 미지정 시 기본 헤더. */
  header?: ReactNode
  /**
   * 넓은 화면(lg≥1024px)에서 본문 폭을 확장한다.
   * 기본은 모바일 우선 max-w-screen-md(768px). `wide`면 lg부터 max-w-screen-xl(1280px)로
   * 넓혀 홈의 2단 레이아웃(리스트 + 지도)을 담을 공간을 확보한다.
   */
  wide?: boolean
}

export function AppShell({ children, header, wide = false }: Props) {
  return (
    <>
      {header ?? <AppHeader />}
      {/* 헤더가 fixed라 흐름에서 빠지므로 h-14(56px) + 기존 pt-4(16px) = pt-[4.5rem] */}
      <main
        className={`mx-auto w-full flex-1 px-4 pb-24 pt-[4.5rem] ${
          wide ? 'max-w-screen-md lg:max-w-screen-xl' : 'max-w-screen-md'
        }`}
      >
        {children}
      </main>
      <BottomNav />
    </>
  )
}
