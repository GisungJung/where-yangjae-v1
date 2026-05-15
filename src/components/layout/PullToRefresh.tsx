/**
 * 모바일 Pull-to-refresh 컴포넌트 (목업 §11).
 *
 * - 스크롤 최상단(window scrollY === 0)에서 아래로 당기면 인디케이터 노출.
 * - 3단계 상태:
 *   (1) 50px 미만  → "아래로 당겨서 새로고침"
 *   (2) 50px 이상  → "놓아서 새로고침"
 *   (3) 트리거 후  → 회전 스피너 + "새로 불러오는 중…" → onRefresh resolve 시 닫힘
 * - TouchEvent 우선, PointerEvent fallback.
 * - 데스크탑(마우스)에서는 무동작 (touch 이벤트만 청취).
 *
 * 새 npm 의존성 없이 React 훅으로 직접 구현.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from '../ui/Icon'

interface Props {
  /** 새로고침 핸들러. Promise resolve 시 인디케이터가 닫힌다. */
  onRefresh: () => Promise<unknown> | unknown
  children: ReactNode
  /** 트리거 임계값 (px, 기본 60). */
  threshold?: number
  /** 컴포넌트 비활성화 (예: 다른 페이지에서 일시 차단). */
  disabled?: boolean
}

type Status = 'idle' | 'pulling' | 'ready' | 'refreshing'

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 60,
  disabled = false,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [pull, setPull] = useState(0)
  const startY = useRef<number | null>(null)
  const tracking = useRef(false)

  const reset = useCallback(() => {
    startY.current = null
    tracking.current = false
    setPull(0)
    setStatus('idle')
  }, [])

  const finish = useCallback(async () => {
    setStatus('refreshing')
    setPull(threshold)
    try {
      await onRefresh()
    } finally {
      reset()
    }
  }, [onRefresh, reset, threshold])

  useEffect(() => {
    if (disabled) return
    if (typeof window === 'undefined') return

    const onTouchStart = (e: TouchEvent) => {
      if (status === 'refreshing') return
      // 스크롤 위치가 최상단일 때만 PTR 시작
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0
      if (scrollTop > 0) return
      const t = e.touches[0]
      if (!t) return
      startY.current = t.clientY
      tracking.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || startY.current === null) return
      if (status === 'refreshing') return
      const t = e.touches[0]
      if (!t) return
      const delta = t.clientY - startY.current
      if (delta <= 0) {
        // 위로 올리는 동작 → PTR 취소
        if (status !== 'idle') {
          setPull(0)
          setStatus('idle')
        }
        return
      }
      // 저항감을 위해 0.5 배율
      const adjusted = Math.min(delta * 0.5, threshold * 2)
      setPull(adjusted)
      setStatus(adjusted >= threshold ? 'ready' : 'pulling')
      // 페이지 스크롤 방지 (당기는 모션 중)
      if (e.cancelable && delta > 5) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (!tracking.current) return
      tracking.current = false
      if (status === 'ready') {
        void finish()
      } else if (status !== 'refreshing') {
        reset()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    // touchmove는 preventDefault 위해 passive: false
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [disabled, status, threshold, finish, reset])

  // 새로고침 중에는 56px 고정 표시, 끌고 있을 땐 pull과 동일.
  const indicatorHeight =
    status === 'refreshing' ? 56 : status === 'idle' ? 0 : Math.max(pull, 0)
  const visible = status !== 'idle'
  const label =
    status === 'refreshing'
      ? '새로 불러오는 중…'
      : status === 'ready'
        ? '놓아서 새로고침'
        : '아래로 당겨서 새로고침'

  return (
    <>
      <div
        aria-hidden={!visible}
        className="overflow-hidden transition-[height] duration-100"
        style={{ height: indicatorHeight }}
      >
        <div className="flex h-full min-h-[56px] items-center justify-center gap-2 border-b border-surface-border/60 bg-surface-muted text-[13px] font-semibold text-brand-primary">
          {status === 'refreshing' ? (
            <span className="ptr-spinner inline-flex">
              <Icon name="refresh" size={18} />
            </span>
          ) : (
            <span
              className="inline-flex transition-transform"
              style={{
                transform: status === 'ready' ? 'rotate(180deg)' : 'none',
              }}
            >
              <Icon name="chevron-down" size={18} />
            </span>
          )}
          <span>{label}</span>
        </div>
      </div>
      {children}
    </>
  )
}
