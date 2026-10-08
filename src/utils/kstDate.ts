/**
 * KST(한국 표준시) 날짜 유틸 — 방문 체크인(2026-10-08).
 *
 * DB는 visited_on을 `(now() AT TIME ZONE 'Asia/Seoul')::date`로 기록하므로
 * 클라이언트의 "오늘"·"최근 7일" 판단도 같은 기준이어야 한다.
 * KST는 UTC+9 고정(서머타임 없음)이라 Intl 없이 오프셋 계산으로 충분.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 주어진 시각의 KST 날짜 'YYYY-MM-DD' */
export function kstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** KST 오늘 기준 days일 전 날짜 'YYYY-MM-DD' */
export function kstDaysAgo(days: number, now: Date = new Date()): string {
  return kstDateString(new Date(now.getTime() - days * DAY_MS))
}
