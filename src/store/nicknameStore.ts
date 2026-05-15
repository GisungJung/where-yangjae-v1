/**
 * 닉네임 매니저 (Zustand + persist)
 *
 * 익명 시스템에서 "나" 식별의 단일 출처.
 * - `nickname`: 사용자 표시용 (콤보박스 prefill 등)
 * - `reviewerId`: Supabase `reviewers.id` UUID. RLS가 헤더로 검증할 때 쓴다.
 *
 * 평가가 처음 성공하면 `setIdentity(nickname, reviewerId)`를 호출해
 * 이후 같은 사람이 자기 평가를 수정/삭제할 수 있도록 한다.
 *
 * RLS 정책(기획서 §10.2)이 `x-reviewer-id` 헤더를 검증하므로
 * `src/lib/supabase.ts`의 fetch 래퍼가 store를 구독해 헤더를 주입한다.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NicknameState {
  /** 마지막으로 사용한 닉네임 (UI prefill용) */
  nickname: string | null
  /** reviewers.id — RLS 헤더에 박힘 */
  reviewerId: string | null
  setIdentity: (nickname: string, reviewerId: string) => void
  /** 닉네임만 변경 — reviewerId는 유지. task #19. */
  updateNickname: (nickname: string) => void
  clear: () => void
}

export const useNicknameStore = create<NicknameState>()(
  persist(
    (set) => ({
      nickname: null,
      reviewerId: null,
      setIdentity: (nickname, reviewerId) =>
        set({ nickname: nickname.trim() || null, reviewerId: reviewerId || null }),
      updateNickname: (nickname) =>
        set({ nickname: nickname.trim() || null }),
      clear: () => set({ nickname: null, reviewerId: null }),
    }),
    {
      name: 'yangjai.nickname.v1',
      // SSR 무관(SPA)이지만, 잘못된 키가 들어오는 것을 막기 위한 마이그레이션 후크는 v2에서.
      version: 1,
      partialize: (state) => ({
        nickname: state.nickname,
        reviewerId: state.reviewerId,
      }),
    },
  ),
)

/**
 * 비반응형 접근자.
 * - fetch 래퍼처럼 React 외부에서 현재 reviewerId가 필요한 곳에서 쓴다.
 */
export function getCurrentReviewerId(): string | null {
  return useNicknameStore.getState().reviewerId
}
