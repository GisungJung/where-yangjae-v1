/**
 * CSS 미디어쿼리 매칭 여부를 구독하는 훅.
 *
 * 반응형 레이아웃에서 "넓은 화면일 때만 무거운 컴포넌트(예: 카카오맵)를 마운트"하는
 * 용도로 사용한다. CSS `hidden lg:block`과 달리 미스매치 시 DOM에서 아예 제거되므로
 * 모바일에서 카카오 SDK가 불필요하게 로드되거나 0-높이 컨테이너에 렌더되는 문제를 피한다.
 *
 * SSR/구형 사파리 대응: addEventListener가 없으면 addListener로 폴백.
 */

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)

    // 초기 동기화 (query 변경 시점 반영)
    onChange()

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    // 구형 브라우저 폴백
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [query])

  return matches
}
