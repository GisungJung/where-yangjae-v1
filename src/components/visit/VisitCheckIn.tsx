/**
 * 상세 화면 방문 체크인 (2026-10-08).
 * 설계: doc/plan/features/2026-10-08-visit-checkin-roulette-design.md §2
 *
 * - 집계 "최근 7일 N회 · 누적 M회 방문" (누가 갔는지는 노출하지 않음)
 * - "오늘 여기 먹었어요" / 오늘 기록됨이면 "✓ 오늘 방문함 · 취소"
 * - 정체성이 없으면 인라인 닉네임 입력
 * - restaurant_visits 테이블 미적용 시 렌더하지 않음
 */

import { useState } from 'react'
import { useCheckIn } from '@/hooks/useVisits'
import { Icon } from '@/components/ui/Icon'
import { NicknamePrompt } from './NicknamePrompt'

interface Props {
  restaurantId: string
  visits7d: number
  visitsTotal: number
}

export function VisitCheckIn({ restaurantId, visits7d, visitsTotal }: Props) {
  const { available, hasIdentity, todayVisitFor, checkIn, undo } = useCheckIn()
  const [askNickname, setAskNickname] = useState(false)

  if (!available) return null

  const todayVisit = todayVisitFor(restaurantId)
  const error = checkIn.error ?? undo.error
  const busy = checkIn.isPending || undo.isPending

  const record = (nickname?: string) =>
    checkIn.mutate(
      { restaurantId, nickname },
      { onSuccess: () => setAskNickname(false) },
    )

  return (
    <section
      aria-label="방문 체크인"
      className="space-y-2 rounded-card border border-surface-border bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-700">
          {visitsTotal > 0 ? (
            <>
              최근 7일 <strong className="text-ink-900">{visits7d}회</strong> ·
              누적 <strong className="text-ink-900">{visitsTotal}회</strong> 방문
            </>
          ) : (
            '아직 방문 기록이 없어요'
          )}
        </p>

        {todayVisit ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-primary">
            ✓ 오늘 방문함
            <button
              type="button"
              onClick={() => undo.mutate(todayVisit)}
              disabled={busy}
              className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-surface-muted disabled:opacity-50"
            >
              취소
            </button>
          </span>
        ) : (
          !askNickname && (
            <button
              type="button"
              onClick={() => (hasIdentity ? record() : setAskNickname(true))}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-button bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Icon name="utensils" size={13} />
              {checkIn.isPending ? '기록 중…' : '오늘 여기 먹었어요'}
            </button>
          )
        )}
      </div>

      {askNickname && !todayVisit && (
        <NicknamePrompt
          submitLabel="기록하기"
          pending={checkIn.isPending}
          onSubmit={(nickname) => record(nickname)}
          onCancel={() => setAskNickname(false)}
        />
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error instanceof Error ? error.message : '방문 기록 중 오류가 발생했어요.'}
        </p>
      )}
    </section>
  )
}
