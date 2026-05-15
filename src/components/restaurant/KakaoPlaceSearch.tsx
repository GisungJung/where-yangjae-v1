/**
 * 카카오 장소 검색 (맛집 등록 폼용)
 *
 * - 키워드 입력 → "검색" 클릭 → SDK의 keywordSearch 호출
 * - 결과 5건을 카드로 표시. 사용자가 선택하면 onPick으로 lat/lng/kakao_place_id 전달.
 * - SDK는 클라이언트에서 직접 호출(JS Key). 서버 호출 불필요.
 */

import { useState } from 'react'
import {
  searchKakaoPlaces,
  type KakaoPlaceSearchResult,
} from '../../lib/kakao'

export interface PickedPlace {
  name: string
  address: string
  lat: number
  lng: number
  kakaoPlaceId: string
}

interface Props {
  onPick: (place: PickedPlace) => void
  initialKeyword?: string
}

export function KakaoPlaceSearch({ onPick, initialKeyword = '' }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [results, setResults] = useState<KakaoPlaceSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const runSearch = async () => {
    const q = keyword.trim()
    if (!q) {
      setError('검색어를 입력해 주세요.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const list = await searchKakaoPlaces(q)
      setResults(list.slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색에 실패했어요.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void runSearch()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="가게명 또는 도로명 주소"
          className="flex-1 rounded-input border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={loading}
          className="rounded-button bg-brand-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? '검색 중…' : '검색'}
        </button>
      </div>

      {error && (
        <p className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="rounded-input border border-dashed border-surface-border bg-white px-3 py-2 text-xs text-ink-500">
          검색 결과가 없어요. 다른 키워드를 시도해 보세요.
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((place) => {
            const selected = pickedId === place.id
            return (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPickedId(place.id)
                    onPick({
                      name: place.place_name,
                      address: place.road_address_name || place.address_name,
                      lat: Number(place.y),
                      lng: Number(place.x),
                      kakaoPlaceId: place.id,
                    })
                  }}
                  className={[
                    'block w-full rounded-card border bg-white p-3 text-left transition-colors',
                    selected
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-surface-border hover:bg-surface-muted',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold text-ink-900">
                    {place.place_name}
                  </p>
                  {place.category_name && (
                    <p className="mt-0.5 text-xs text-ink-500">
                      {place.category_name}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-700">
                    {place.road_address_name || place.address_name}
                  </p>
                  {selected && (
                    <p className="mt-1 text-xs font-medium text-brand-primary">
                      선택됨
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
