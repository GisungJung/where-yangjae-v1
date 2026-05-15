/**
 * 표시 포맷 유틸
 */

/** 0.0 ~ 5.0 평점을 "4.3" 같은 한 자리 소수로 포맷. null이면 placeholder. */
export function formatScore(score: number | null, placeholder = '평가 없음'): string {
  if (score === null || Number.isNaN(score)) return placeholder
  return score.toFixed(1)
}

/** "2025-05-10T12:34:56Z" → "5/10" 같은 짧은 한국식 표기. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** "2025-05-10T12:34:56Z" → "2025.05.10" */
export function formatYmd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

export function classNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ')
}
