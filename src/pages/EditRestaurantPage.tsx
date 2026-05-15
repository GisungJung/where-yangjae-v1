/**
 * 식당 정보 수정 페이지 (라우트: `/restaurants/:id/edit`) — task #3
 *
 * 기획서 §8.2 헤더 ⋯ 메뉴 ① 정보 수정 → 본 페이지로 진입.
 * AddRestaurantPage 패턴을 차용하되 다음 차이:
 * - 모든 필드 prefill (`useRestaurant(id)` 결과)
 * - 닉네임 입력 없음 — `registered_by`는 변경하지 않음(원 등록자 보존)
 * - 중복 배너 없음 — 편집은 신원 변경이 아닌 정보 보정 목적
 * - 저장 후 상세로 복귀, 캐시 invalidate
 * - 카카오 장소 재선택(KakaoPlaceSearch) 또는 좌표 해제(null) 가능
 *
 * RLS: `restaurants_update_all` (마이그레이션 20260514120008) anon UPDATE 허용.
 * `updated_at`은 DB BEFORE UPDATE 트리거가 갱신.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  KakaoPlaceSearch,
  type PickedPlace,
} from '../components/restaurant/KakaoPlaceSearch'
import { KakaoMapView } from '../components/map/KakaoMapView'
import { YANGJAE_STATION } from '../lib/kakao'
import { updateRestaurant, type UpdateRestaurantInput } from '../api/restaurants'
import {
  CATEGORIES,
  type Category,
  type Restaurant,
  type SheetType,
} from '../types/domain'
import { restaurantsKeys, useRestaurant } from '../hooks/useRestaurants'

export default function EditRestaurantPage() {
  const { id } = useParams<{ id: string }>()
  const { data: restaurant, isLoading, isError, error } = useRestaurant(id)

  if (!id) return <AppShell><MissingId /></AppShell>
  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-ink-500">불러오는 중…</div>
      </AppShell>
    )
  }
  if (isError || !restaurant) {
    return (
      <AppShell>
        <div className="space-y-2 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">식당을 불러오지 못했어요.</p>
          {error instanceof Error && (
            <p className="text-xs text-red-600">{error.message}</p>
          )}
          <Link to="/" className="inline-block text-xs underline">
            홈으로 돌아가기
          </Link>
        </div>
      </AppShell>
    )
  }

  // 데이터 로드 후 키를 식당 id로 박아 form state 재초기화를 보장.
  return <EditForm key={restaurant.id} restaurant={restaurant} />
}

interface EditFormProps {
  restaurant: Restaurant
}

function EditForm({ restaurant }: EditFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // prefill — 빈 문자열로 안전 정규화
  const [name, setName] = useState(restaurant.name)
  const [category, setCategory] = useState<Category>(restaurant.category)
  const [sheetType, setSheetType] = useState<SheetType>(restaurant.sheet_type)
  const [menu, setMenu] = useState(restaurant.menu ?? '')
  const [note, setNote] = useState(restaurant.note ?? '')
  const [naverUrl, setNaverUrl] = useState(restaurant.naver_url ?? '')
  /**
   * 좌표 상태 — 초기값은 기존 식당 좌표/kakao_place_id.
   * 사용자가 KakaoPlaceSearch로 재선택하면 picked → 이쪽으로 반영.
   * "좌표 해제" 버튼으로 모두 null 처리 가능.
   */
  const [lat, setLat] = useState<number | null>(restaurant.lat)
  const [lng, setLng] = useState<number | null>(restaurant.lng)
  const [kakaoPlaceId, setKakaoPlaceId] = useState<string | null>(
    restaurant.kakao_place_id,
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (payload: UpdateRestaurantInput) =>
      updateRestaurant(restaurant.id, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
      void queryClient.invalidateQueries({
        queryKey: restaurantsKeys.detail(updated.id),
      })
      navigate(`/restaurants/${updated.id}`)
    },
  })

  const handleRepick = (place: PickedPlace) => {
    setLat(place.lat)
    setLng(place.lng)
    setKakaoPlaceId(place.kakaoPlaceId)
    // 상호명이 비어있을 리는 거의 없지만 안전망: 비었을 때만 prefill.
    if (!name.trim()) setName(place.name)
  }

  const clearCoords = () => {
    setLat(null)
    setLng(null)
    setKakaoPlaceId(null)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setValidationError('상호명을 입력해 주세요.')
      return
    }
    if (trimmed.length > 100) {
      setValidationError('상호명은 100자 이하여야 합니다.')
      return
    }
    if (naverUrl.trim()) {
      try {
        new URL(naverUrl.trim())
      } catch {
        setValidationError('네이버 지도 URL이 올바르지 않습니다.')
        return
      }
    }

    const payload: UpdateRestaurantInput = {
      name: trimmed,
      category,
      sheet_type: sheetType,
      menu: menu.trim() || undefined,
      note: note.trim() || undefined,
      naver_url: naverUrl.trim() || undefined,
      lat,
      lng,
      kakao_place_id: kakaoPlaceId,
    }
    mutation.mutate(payload)
  }

  const mutationError =
    mutation.error instanceof Error
      ? mutation.error.message
      : mutation.error
        ? '수정에 실패했어요.'
        : null
  const errorMessage = validationError ?? mutationError
  const isSubmitting = mutation.isPending

  const hasCoords = lat !== null && lng !== null

  return (
    <AppShell>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">정보 수정</h1>
          <p className="mt-1 text-xs text-ink-500">
            원 등록자 정보는 그대로 보존돼요.
          </p>
        </div>
        <Link
          to={`/restaurants/${restaurant.id}`}
          className="text-xs font-medium text-ink-500 underline hover:text-ink-700"
        >
          취소
        </Link>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" aria-label="식당 정보 수정">
        {/* 좌표 / 카카오 장소 — 재선택 가능 */}
        <section className="space-y-2 rounded-card border border-surface-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            위치
          </p>
          <p className="text-xs text-ink-500">
            카카오 장소 검색으로 좌표를 갱신하거나, 아래 "좌표 해제"로 비울 수
            있어요.
          </p>
          <KakaoPlaceSearch onPick={handleRepick} />

          <div className="rounded-input border border-surface-border bg-surface-muted p-3 text-xs text-ink-700">
            {hasCoords ? (
              <>
                <p className="font-semibold text-ink-900">
                  좌표: {lat!.toFixed(5)}, {lng!.toFixed(5)}
                </p>
                {kakaoPlaceId && (
                  <p className="mt-0.5 text-ink-500">
                    kakao_place_id: {kakaoPlaceId}
                  </p>
                )}
                <button
                  type="button"
                  onClick={clearCoords}
                  className="mt-2 text-xs font-medium text-red-700 underline"
                >
                  좌표 해제
                </button>
              </>
            ) : (
              <p className="text-ink-500">좌표 미등록 상태</p>
            )}
          </div>

          <div className="h-48 overflow-hidden rounded-card border border-surface-border bg-surface-muted">
            {hasCoords ? (
              <KakaoMapView
                markers={[
                  {
                    id: kakaoPlaceId || 'preview',
                    lat: lat!,
                    lng: lng!,
                    title: name || restaurant.name,
                  },
                ]}
                center={{ lat: lat!, lng: lng! }}
                level={3}
                className="h-full w-full"
              />
            ) : (
              <KakaoMapView
                markers={[]}
                center={{ lat: YANGJAE_STATION.lat, lng: YANGJAE_STATION.lng }}
                level={4}
                className="h-full w-full"
              />
            )}
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="space-y-3 rounded-card border border-surface-border bg-white p-4">
          <div>
            <label
              htmlFor="edit-name"
              className="block text-sm font-medium text-ink-700"
            >
              상호명 <span className="text-brand-accent">*</span>
            </label>
            <input
              id="edit-name"
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
                htmlFor="edit-category"
                className="block text-sm font-medium text-ink-700"
              >
                카테고리 <span className="text-brand-accent">*</span>
              </label>
              <select
                id="edit-category"
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
                id="edit-sheet-label"
                className="block text-sm font-medium text-ink-700"
              >
                끼니 <span className="text-brand-accent">*</span>
              </span>
              <div
                role="radiogroup"
                aria-labelledby="edit-sheet-label"
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
              htmlFor="edit-menu"
              className="block text-sm font-medium text-ink-700"
            >
              메뉴 <span className="text-xs text-ink-500">(선택)</span>
            </label>
            <textarea
              id="edit-menu"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>

          <div>
            <label
              htmlFor="edit-note"
              className="block text-sm font-medium text-ink-700"
            >
              비고 <span className="text-xs text-ink-500">(선택, 600자 이하)</span>
            </label>
            <textarea
              id="edit-note"
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
              htmlFor="edit-naver"
              className="block text-sm font-medium text-ink-700"
            >
              네이버 지도 URL <span className="text-xs text-ink-500">(선택)</span>
            </label>
            <input
              id="edit-naver"
              type="url"
              value={naverUrl}
              onChange={(e) => setNaverUrl(e.target.value)}
              placeholder="https://map.naver.com/..."
              className="mt-1 w-full rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
        </section>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2">
          <Link
            to={`/restaurants/${restaurant.id}`}
            className="flex-1 rounded-button border border-surface-border bg-white px-4 py-3 text-center text-sm font-medium text-ink-700 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-button bg-brand-accent px-4 py-3 text-base font-bold text-white shadow-sm hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && (
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
            )}
            {isSubmitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </AppShell>
  )
}

function MissingId() {
  return (
    <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-medium">잘못된 경로입니다.</p>
      <Link to="/" className="mt-2 inline-block text-xs underline">
        홈으로
      </Link>
    </div>
  )
}
