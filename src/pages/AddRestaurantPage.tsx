import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { KakaoPlaceSearch, type PickedPlace } from '../components/restaurant/KakaoPlaceSearch'
import { KakaoMapView } from '../components/map/KakaoMapView'
import { YANGJAE_STATION } from '../lib/kakao'
import { insertRestaurant } from '../api/restaurants'
import {
  CATEGORIES,
  NewRestaurantInputSchema,
  type Category,
  type NewRestaurantInput,
  type RestaurantWithStats,
  type SheetType,
} from '../types/domain'
import { restaurantsKeys, useRestaurants } from '../hooks/useRestaurants'
import { useNicknameStore } from '../store/nicknameStore'

export default function AddRestaurantPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: restaurantsResult } = useRestaurants()
  const storedNickname = useNicknameStore((s) => s.nickname)
  const setIdentity = useNicknameStore((s) => s.setIdentity)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('한식')
  const [sheetType, setSheetType] = useState<SheetType>('lunch')
  const [menu, setMenu] = useState('')
  const [note, setNote] = useState('')
  const [naverUrl, setNaverUrl] = useState('')
  const [picked, setPicked] = useState<PickedPlace | null>(null)
  const [nickname, setNickname] = useState(storedNickname ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  /** 사용자가 중복 경고를 무시하고 진행하기로 명시한 경우 true. */
  const [overrideDuplicate, setOverrideDuplicate] = useState(false)

  // 저장된 닉네임이 변경되면 input 동기화 (최초 진입 시점만)
  useEffect(() => {
    if (storedNickname && !nickname) {
      setNickname(storedNickname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedNickname])

  /**
   * 중복 검사 — 카카오 장소가 선택되어 있으면 kakao_place_id 우선, 아니면 이름 정확 일치.
   * 클라이언트 사전 체크만(기획서 §8.4). DB 제약은 dba 영역.
   */
  const duplicates = useMemo((): RestaurantWithStats[] => {
    const all = restaurantsResult?.data ?? []
    if (all.length === 0) return []
    const matches: RestaurantWithStats[] = []
    const trimmedName = name.trim()
    const kakaoId = picked?.kakaoPlaceId ?? null
    for (const r of all) {
      if (kakaoId && r.kakao_place_id && r.kakao_place_id === kakaoId) {
        matches.push(r)
        continue
      }
      if (trimmedName && r.name === trimmedName) {
        matches.push(r)
      }
    }
    return matches
  }, [restaurantsResult?.data, name, picked?.kakaoPlaceId])

  const hasDuplicate = duplicates.length > 0

  // 폼 핵심 필드가 바뀌면 override 해제 → 사용자가 다시 명시적으로 동의해야 함.
  useEffect(() => {
    setOverrideDuplicate(false)
  }, [name, picked?.kakaoPlaceId])

  const mutation = useMutation({
    mutationFn: (input: NewRestaurantInput) => insertRestaurant(input),
    onSuccess: ({ restaurant, reviewerId }) => {
      // 등록자 정체성 저장 → 다음 평가 폼 prefill·자기 평가 수정에 사용
      setIdentity(nickname.trim(), reviewerId)
      queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
      navigate(`/restaurants/${restaurant.id}`)
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (hasDuplicate && !overrideDuplicate) {
      setValidationError(
        '이미 등록된 식당이 있어요. 위 배너를 확인하고 "그래도 등록"을 눌러주세요.',
      )
      return
    }

    const payload: NewRestaurantInput = {
      name: name.trim(),
      category,
      sheet_type: sheetType,
      menu: menu.trim() || undefined,
      note: note.trim() || undefined,
      naver_url: naverUrl.trim() || undefined,
      lat: picked?.lat ?? null,
      lng: picked?.lng ?? null,
      kakao_place_id: picked?.kakaoPlaceId ?? null,
      nickname: nickname.trim(),
    }

    const parsed = NewRestaurantInputSchema.safeParse(payload)
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      )
      return
    }
    mutation.mutate(parsed.data)
  }

  const mutationError =
    mutation.error instanceof Error
      ? mutation.error.message
      : mutation.error
        ? '등록에 실패했어요.'
        : null
  const errorMessage = validationError ?? mutationError
  const isSubmitting = mutation.isPending

  const handlePick = (place: PickedPlace) => {
    setPicked(place)
    // 상호명이 비어있으면 카카오 결과로 prefill
    if (!name.trim()) setName(place.name)
  }

  return (
    <AppShell>
      <header className="mb-3">
        <h1 className="text-xl font-bold text-ink-900">맛집 등록</h1>
        <p className="mt-1 text-xs text-ink-500">
          로그인 없이 닉네임만 입력하면 등록할 수 있어요.
        </p>
      </header>

      {hasDuplicate && (
        <DuplicateBanner
          duplicates={duplicates}
          override={overrideDuplicate}
          onToggleOverride={() => setOverrideDuplicate((p) => !p)}
        />
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-4"
        aria-label="맛집 등록"
      >
        <section className="space-y-2 rounded-card border border-surface-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            장소 검색 (선택)
          </p>
          <p className="text-xs text-ink-500">
            카카오에서 검색하면 위치·좌표가 자동으로 채워져요. 검색이 어렵다면
            아래 정보만 입력해도 등록됩니다.
          </p>
          <KakaoPlaceSearch onPick={handlePick} />
          {picked && (
            <div className="rounded-input border border-brand-primary/30 bg-brand-primary/5 p-3 text-xs text-ink-700">
              <p className="font-semibold text-ink-900">{picked.name}</p>
              <p className="mt-0.5">{picked.address}</p>
              <p className="mt-0.5 text-ink-500">
                좌표: {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
              </p>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="mt-2 text-xs font-medium text-brand-primary underline"
              >
                선택 취소
              </button>
            </div>
          )}

          {/* G9: 위치 미리보기 지도 */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-ink-500">
              {picked
                ? '선택한 장소가 맞나요?'
                : '장소를 검색·선택하면 여기 표시됩니다.'}
            </p>
            <div className="h-48 overflow-hidden rounded-card border border-surface-border bg-surface-muted">
              {picked ? (
                <KakaoMapView
                  markers={[
                    {
                      id: picked.kakaoPlaceId || 'preview',
                      lat: picked.lat,
                      lng: picked.lng,
                      title: picked.name,
                    },
                  ]}
                  center={{ lat: picked.lat, lng: picked.lng }}
                  level={3}
                  className="h-full w-full"
                />
              ) : (
                <KakaoMapView
                  markers={[]}
                  center={{
                    lat: YANGJAE_STATION.lat,
                    lng: YANGJAE_STATION.lng,
                  }}
                  level={4}
                  className="h-full w-full"
                />
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-card border border-surface-border bg-white p-4">
          <div>
            <label
              htmlFor="add-name"
              className="block text-sm font-medium text-ink-700"
            >
              상호명 <span className="text-brand-accent">*</span>
            </label>
            <input
              id="add-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="add-category"
                className="block text-sm font-medium text-ink-700"
              >
                카테고리 <span className="text-brand-accent">*</span>
              </label>
              <select
                id="add-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span
                id="add-sheet-label"
                className="block text-sm font-medium text-ink-700"
              >
                끼니 <span className="text-brand-accent">*</span>
              </span>
              <div
                role="radiogroup"
                aria-labelledby="add-sheet-label"
                className="mt-1 flex gap-0.5 rounded-lg bg-surface-muted p-1"
              >
                {[
                  { value: 'lunch' as const, label: '점심' },
                  { value: 'dinner' as const, label: '저녁회식' },
                ].map((opt) => {
                  const active = sheetType === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSheetType(opt.value)}
                      className={[
                        'flex-1 rounded-md py-2 text-sm font-semibold transition-colors',
                        active
                          ? 'bg-white text-brand-primary shadow-sm'
                          : 'text-ink-700',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="add-menu"
              className="block text-sm font-medium text-ink-700"
            >
              메뉴 <span className="text-xs text-ink-500">(선택)</span>
            </label>
            <textarea
              id="add-menu"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>

          <div>
            <label
              htmlFor="add-note"
              className="block text-sm font-medium text-ink-700"
            >
              비고 <span className="text-xs text-ink-500">(선택, 600자 이하)</span>
            </label>
            <textarea
              id="add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              rows={2}
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
            <div className="mt-1 text-right text-xs text-ink-500">
              {note.length} / 600
            </div>
          </div>

          <div>
            <label
              htmlFor="add-naver"
              className="block text-sm font-medium text-ink-700"
            >
              네이버 지도 URL <span className="text-xs text-ink-500">(선택)</span>
            </label>
            <input
              id="add-naver"
              type="url"
              value={naverUrl}
              onChange={(e) => setNaverUrl(e.target.value)}
              placeholder="https://map.naver.com/..."
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
        </section>

        <section className="space-y-2 rounded-card border border-surface-border bg-white p-4">
          <label
            htmlFor="add-nickname"
            className="block text-sm font-medium text-ink-700"
          >
            등록자 닉네임 <span className="text-brand-accent">*</span>
          </label>
          <input
            id="add-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoComplete="off"
            placeholder="닉네임 입력"
            className="w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
          <p className="text-xs text-ink-500">
            누가 추가했는지 흔적만 남기는 가벼운 식별이에요.
          </p>
        </section>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || (hasDuplicate && !overrideDuplicate)}
          className="flex w-full items-center justify-center gap-2 rounded-button bg-brand-accent px-4 py-3 text-base font-bold text-white shadow-sm hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && (
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden
            />
          )}
          {isSubmitting ? '등록 중…' : '맛집 등록'}
        </button>
      </form>
    </AppShell>
  )
}

function DuplicateBanner({
  duplicates,
  override,
  onToggleOverride,
}: {
  duplicates: RestaurantWithStats[]
  override: boolean
  onToggleOverride: () => void
}) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">이미 등록된 식당이 있어요</p>
      <p className="mt-1 text-xs text-amber-800">
        같은 이름 또는 같은 카카오 장소 ID로 등록된 식당이 발견됐어요. 정말 새로
        등록할까요?
      </p>
      <ul className="mt-2 space-y-1">
        {duplicates.map((d) => (
          <li key={d.id} className="text-xs">
            <Link
              to={`/restaurants/${d.id}`}
              className="font-semibold text-amber-900 underline hover:text-amber-700"
            >
              {d.name}
            </Link>{' '}
            <span className="text-amber-700">
              ({d.category}, {d.sheet_type === 'lunch' ? '점심' : '저녁회식'})
            </span>{' '}
            <Link
              to={`/restaurants/${d.id}`}
              className="ml-1 text-amber-700 underline"
            >
              상세 보기 ↗
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={onToggleOverride}
          aria-pressed={override}
          className={[
            'rounded-button px-3 py-1.5 text-xs font-semibold transition-colors',
            override
              ? 'border border-amber-700 bg-amber-700 text-white'
              : 'border border-amber-400 bg-white text-amber-800 hover:bg-amber-100',
          ].join(' ')}
        >
          {override ? '그래도 등록 (확인됨)' : '그래도 등록'}
        </button>
      </div>
    </div>
  )
}
