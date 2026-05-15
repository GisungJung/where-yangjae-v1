/**
 * Supabase 클라이언트 (브라우저용, 익명 키)
 *
 * - 정식 Auth 없음. 닉네임만으로 식별하는 가벼운 모델.
 * - RLS는 dba가 관리. 클라이언트는 RLS 통과 가능한 쿼리만 던진다.
 * - 본인 평가 UPDATE/DELETE는 RLS가 `x-reviewer-id` 헤더로 검증하므로
 *   fetch 래퍼에서 nicknameStore를 구독해 매 요청마다 헤더를 동적으로 주입한다.
 *   (단일 클라이언트 + 동적 헤더 — 클라이언트 재생성 없이 자기 평가만 수정/삭제 가능)
 *
 * 환경변수
 * - VITE_SUPABASE_URL              (Supabase 프로젝트 URL)
 * - VITE_SUPABASE_ANON_KEY         (RLS 전제 anon key)
 *   또는 VITE_SUPABASE_PUBLISHABLE_KEY (Supabase가 2024부터 부르는 별칭)
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { getCurrentReviewerId } from '../store/nicknameStore'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)

if (!url || !key) {
  // 개발 중 누락을 명확히 알리는 용도. 빌드는 막지 않는다.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY(또는 PUBLISHABLE_KEY)가 비어있습니다. .env 확인 필요.',
  )
}

/**
 * fetch 래퍼: 매 요청마다 store에서 reviewerId를 읽어 헤더 주입.
 * RLS 정책 `current_setting('request.headers', true)::json->>'x-reviewer-id'`가
 * 이 값을 읽고 본인 평가 UPDATE/DELETE를 통과시킨다.
 */
const fetchWithReviewerHeader: typeof fetch = (input, init) => {
  const reviewerId = getCurrentReviewerId()
  if (!reviewerId) return fetch(input, init)

  const headers = new Headers(init?.headers ?? {})
  // 기존 헤더가 명시적으로 들어와 있으면 덮어쓰지 않는다.
  if (!headers.has('x-reviewer-id')) {
    headers.set('x-reviewer-id', reviewerId)
  }
  return fetch(input, { ...init, headers })
}

export const supabase = createClient<Database>(url ?? '', key ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'x-application-name': 'where-yangjae',
    },
    fetch: fetchWithReviewerHeader,
  },
})

/**
 * Supabase 환경이 셋업되었는지 빠르게 검사.
 * UI 측에서 빈 상태/에러 처리를 분기할 때 쓴다.
 */
export const isSupabaseConfigured = Boolean(url && key)
