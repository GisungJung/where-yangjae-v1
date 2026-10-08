/**
 * 첫 체크인용 인라인 닉네임 입력 (2026-10-08).
 * 정체성(reviewerId)이 없는 사용자가 방문을 기록하려 할 때 그 자리에서 닉네임을 받는다.
 */

import { useState } from 'react'

interface Props {
  submitLabel: string
  pending: boolean
  onSubmit: (nickname: string) => void
  onCancel: () => void
  cancelLabel?: string
}

export function NicknamePrompt({
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  cancelLabel = '취소',
}: Props) {
  const [nickname, setNickname] = useState('')
  const trimmed = nickname.trim()

  return (
    <form
      className="space-y-2 rounded-card border border-brand-primary/30 bg-brand-primary/5 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSubmit(trimmed)
      }}
    >
      <label htmlFor="visit-nickname" className="block text-xs text-ink-700">
        처음이시네요! 닉네임을 입력하면 방문이 기록돼요.
        <span className="block text-[11px] text-ink-500">
          기록은 나만 보고, 다른 사람에겐 방문 횟수만 보여요.
        </span>
      </label>
      <input
        id="visit-nickname"
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        autoComplete="off"
        autoFocus
        placeholder="닉네임"
        className="w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-button border border-surface-border bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={!trimmed || pending}
          className="flex-1 rounded-button bg-brand-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? '기록 중…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
