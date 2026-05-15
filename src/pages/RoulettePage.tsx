/**
 * 룰렛 페이지 (라우트: `/roulette`) — 기획서 §8.5 + 목업 §05~07
 *
 * 3가지 상태:
 *   A (idle)     — 카테고리 + 끼니 선택. "굴려라!" CTA.
 *   B (spinning) — 5줄 슬롯 회전 + 프로그레스 바 + "두근두근…"
 *   C (result)   — confetti + 결과 카드 + "이 식당 갈래!" / "다시 굴리기"
 *
 * - 휴업/폐업 식당은 룰렛 풀에서 항상 제외 (룰렛 휴업/폐업 토글 없음).
 * - 빈 결과 분기 UX 유지.
 * - PullToRefresh로 다시 굴리기 외에 후보 풀 새로고침.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { PullToRefresh } from '../components/layout/PullToRefresh'
import { CategoryChip } from '../components/restaurant/CategoryChip'
import { KakaoMapView } from '../components/map/KakaoMapView'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/empty/EmptyState'
import { pickRandomRestaurant } from '../api/restaurants'
import { restaurantsKeys, useRestaurants } from '../hooks/useRestaurants'
import {
  CATEGORIES,
  type Category,
  type Restaurant,
  type RestaurantWithStats,
  type SheetType,
} from '../types/domain'

/** 슬롯 회전 최소 1.5초. 너무 짧으면 "굴렸다"는 정서가 안 산다. */
const MIN_SPIN_MS = 1500

/**
 * 슬롯 회전 보조 — candidates 배열에서 임의 1개 (task #22).
 * 빈 배열일 땐 placeholder.
 */
function randomFrom(arr: string[]): string {
  if (arr.length === 0) return '?'
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 슬롯 초기 5줄 — 시각 효과상 미리 차 있어야 첫 tick 전에도 자연스럽다.
 * 같은 후보 반복 회피 위해 stride로 펼쳐 픽.
 */
function initialLines(candidates: string[]): string[] {
  const pool = candidates.length > 0 ? candidates : ['?']
  return [0, 1, 2, 3, 4].map((i) => pool[(i * 3 + 1) % pool.length])
}

/** 룰렛 카테고리 셀의 우측 이모지 (목업 §05). */
const CATEGORY_EMOJI: Record<Category, string> = {
  한식: '🍚',
  일식: '🍣',
  중식: '🥡',
  분식: '🍱',
  패스트푸드: '🍔',
  아시안: '🍜',
  카페: '☕',
  기타: '🍽️',
}

export default function RoulettePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: restaurantsResult } = useRestaurants()

  const [sheetType, setSheetType] = useState<SheetType>('lunch')
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([])
  const [result, setResult] = useState<Restaurant | null | undefined>(undefined)

  const toggleCategory = (cat: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  /** 풀 사이즈 미리보기 — "조건에 맞는 식당 N곳" 힌트용. */
  const poolSize = useMemo(() => {
    const list = restaurantsResult?.data ?? []
    return list.filter((r) => {
      if (r.status !== '운영중') return false
      if (r.sheet_type !== sheetType) return false
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(r.category)
      ) {
        return false
      }
      return true
    }).length
  }, [restaurantsResult?.data, sheetType, selectedCategories])

  const mutation = useMutation({
    mutationFn: async () => {
      // 슬롯 애니메이션 시간 확보를 위해 최소 1.5초 보장.
      const started = Date.now()
      const picked = await pickRandomRestaurant({
        sheetType,
        categories:
          selectedCategories.length > 0 ? [...selectedCategories] : null,
        includeClosed: false,
      })
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed))
      }
      return picked
    },
    onSuccess: (data) => setResult(data),
  })

  const reset = () => {
    setSelectedCategories([])
    setSheetType('lunch')
    setResult(undefined)
    mutation.reset()
  }

  const isSpinning = mutation.isPending

  // 풀에서 슬롯 회전 중 흘러갈 후보 이름들 (시각 효과용).
  const slotCandidates = useMemo(() => {
    const list = restaurantsResult?.data ?? []
    const pool = list
      .filter((r) => {
        if (r.status !== '운영중') return false
        if (r.sheet_type !== sheetType) return false
        if (
          selectedCategories.length > 0 &&
          !selectedCategories.includes(r.category)
        ) {
          return false
        }
        return true
      })
      .map((r) => r.name)
    if (pool.length >= 5) return pool.slice(0, 8)
    // 부족하면 반복해서 5개 채움
    if (pool.length === 0) return ['?', '?', '?', '?', '?']
    const filled: string[] = []
    while (filled.length < 5) filled.push(...pool)
    return filled.slice(0, 8)
  }, [restaurantsResult?.data, sheetType, selectedCategories])

  return (
    <AppShell>
      <PullToRefresh
        onRefresh={async () => {
          await queryClient.invalidateQueries({ queryKey: restaurantsKeys.all })
        }}
      >
        {result !== undefined && !isSpinning ? (
          <ResultStage
            result={result}
            stats={
              result
                ? (restaurantsResult?.data ?? []).find((r) => r.id === result.id) ?? null
                : null
            }
            candidates={slotCandidates}
            sheetType={sheetType}
            categories={selectedCategories}
            onAgain={() => mutation.mutate()}
            onGo={(id) => navigate(`/restaurants/${id}`)}
            onReset={reset}
          />
        ) : isSpinning ? (
          <SpinningStage
            candidates={slotCandidates}
            sheetType={sheetType}
            categories={selectedCategories}
          />
        ) : (
          <SelectionStage
            sheetType={sheetType}
            onSheetType={setSheetType}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            poolSize={poolSize}
            onSpin={() => mutation.mutate()}
            error={
              mutation.isError
                ? mutation.error instanceof Error
                  ? mutation.error.message
                  : '알 수 없는 오류'
                : null
            }
          />
        )}
      </PullToRefresh>
    </AppShell>
  )
}

/* ──────────────────────────────────────────────────────────
 * A 상태 — 선택
 * ────────────────────────────────────────────────────────── */
function SelectionStage({
  sheetType,
  onSheetType,
  selectedCategories,
  onToggleCategory,
  poolSize,
  onSpin,
  error,
}: {
  sheetType: SheetType
  onSheetType: (s: SheetType) => void
  selectedCategories: Category[]
  onToggleCategory: (c: Category) => void
  poolSize: number
  onSpin: () => void
  error: string | null
}) {
  const disabled = poolSize === 0
  return (
    <div className="space-y-5">
      <header className="text-center">
        <div className="mb-1 text-4xl">🎲</div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900">
          오늘 뭐먹지?
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          카테고리를 1개 이상 골라주세요
        </p>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-900">카테고리</h2>
          <span className="text-xs text-ink-500">
            {selectedCategories.length === 0
              ? '전체'
              : `${selectedCategories.length}개 선택됨`}
          </span>
        </div>
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="카테고리 필터"
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategories.includes(cat)
            // task #21: '기타'를 col-span-2로 따로 빼던 처리 제거 — CATEGORIES 8개가
            // 2-col grid에 정확히 4행 들어가므로 '기타'도 일반 셀로 통일해 정렬 일치.
            return (
              <button
                key={cat}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => onToggleCategory(cat)}
                className={[
                  'flex items-center gap-2.5 rounded-[10px] border-[1.5px] px-3.5 py-3 text-left text-sm font-semibold transition-colors',
                  active
                    ? 'border-brand-accent bg-brand-accent-soft text-ink-900'
                    : 'border-surface-border bg-white text-ink-900 hover:bg-surface-muted',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-[13px]',
                    active
                      ? 'border-brand-accent bg-brand-accent text-white'
                      : 'border-surface-border bg-white text-transparent',
                  ].join(' ')}
                  aria-hidden
                >
                  {active ? '✓' : ''}
                </span>
                <span className="flex-1">{cat}</span>
                <span className="text-lg leading-none" aria-hidden>
                  {CATEGORY_EMOJI[cat]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-ink-900">끼니</h2>
        <SegmentedToggle
          value={sheetType}
          onChange={onSheetType}
          options={[
            { value: 'lunch', label: '점심' },
            { value: 'dinner', label: '저녁회식' },
          ]}
        />
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={onSpin}
          disabled={disabled}
          className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-accent to-orange-400 text-lg font-extrabold text-white shadow-lg shadow-orange-300/40 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <Icon name="dice" size={22} />
          굴려라!
        </button>
        <p className="mt-1.5 text-center text-[11px] text-ink-500">
          {disabled ? (
            '조건에 맞는 식당이 없어요'
          ) : (
            <>
              조건에 맞는 식당{' '}
              <strong className="text-brand-accent">{poolSize}곳</strong> 중에서
              뽑아요
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
 * B 상태 — 스피닝
 * ────────────────────────────────────────────────────────── */
function SpinningStage({
  candidates,
  sheetType,
  categories,
}: {
  candidates: string[]
  sheetType: SheetType
  categories: Category[]
}) {
  // 슬롯머신 효과 — 5줄이 위로 한 칸씩 올라가며 새 후보가 아래에서 진입. (task #22)
  // 처음엔 빠르게(≈ 60ms), 진행에 따라 점점 느려져 슬롯머신 자연 정지 느낌.
  // 컴포넌트 unmount(=결과 도착) 시 자동 종료.
  const [lines, setLines] = useState<string[]>(() => initialLines(candidates))
  const startedAtRef = useRef<number>(0)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    startedAtRef.current = Date.now()
    let mounted = true

    const tick = () => {
      if (!mounted) return
      // 위로 한 칸씩 시프트 + 맨 아래에 새 후보 진입.
      setLines((prev) => [...prev.slice(1), randomFrom(candidates)])
      const elapsed = Date.now() - startedAtRef.current
      // 60ms → 240ms, MIN_SPIN_MS(=1500) 시점까지 ease-out 감속.
      const progress = Math.min(elapsed / MIN_SPIN_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 2) // ease-out quad
      const delay = 60 + 180 * eased
      timeoutRef.current = window.setTimeout(tick, delay)
    }

    timeoutRef.current = window.setTimeout(tick, 60)
    return () => {
      mounted = false
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [candidates])

  return (
    <div className="space-y-3">
      <ConditionCrumb
        sheetType={sheetType}
        categories={categories}
        disabled
      />

      <div className="px-4 py-3 text-center">
        <p className="mb-3 text-sm font-extrabold tracking-widest text-brand-accent">
          🎰 굴리는 중...
        </p>
        <div className="relative mx-auto h-[180px] overflow-hidden rounded-2xl border-[3px] border-brand-accent bg-gradient-to-b from-orange-50 via-white to-orange-50 shadow-xl shadow-orange-300/30">
          <span className="slot-streak-side l" aria-hidden />
          <span className="slot-streak-side r" aria-hidden />
          {/* 위/아래 페이드 */}
          <span
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-white to-transparent"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-white to-transparent"
            aria-hidden
          />
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className={`slot-spin-line s1`}>{lines[0]}</div>
            <div className={`slot-spin-line s2`}>{lines[1]}</div>
            <div className={`slot-spin-line s3`}>{lines[2]}</div>
            <div className={`slot-spin-line s4`}>{lines[3]}</div>
            <div className={`slot-spin-line s5`}>{lines[4]}</div>
          </div>
        </div>

        <div className="mx-4 mt-3 h-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-gradient-to-r from-brand-accent to-orange-300"
            style={{
              animation: `roulette-progress ${MIN_SPIN_MS}ms ease-out forwards`,
            }}
          />
        </div>

        <p className="mt-4 text-sm font-bold tracking-widest text-brand-accent">
          두근두근… <span aria-hidden>⏳</span>
        </p>
      </div>

      <div className="px-4 pt-2 text-center text-xs text-ink-500">
        <div className="mb-2 text-3xl opacity-50" aria-hidden>
          🍽
        </div>
        잠시만요, 가장 맛있는 곳을 고르고 있어요
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
 * C 상태 — 결과
 * ────────────────────────────────────────────────────────── */
function ResultStage({
  result,
  stats,
  candidates,
  sheetType,
  categories,
  onAgain,
  onGo,
  onReset,
}: {
  result: Restaurant | null
  stats: RestaurantWithStats | null
  candidates: string[]
  sheetType: SheetType
  categories: Category[]
  onAgain: () => void
  onGo: (id: string) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      <ConditionCrumb
        sheetType={sheetType}
        categories={categories}
        onEdit={onReset}
      />
      {result ? (
        <ResultDisplay
          result={result}
          stats={stats}
          candidates={candidates}
          onAgain={onAgain}
          onGo={onGo}
        />
      ) : (
        <EmptyState
          illust="roulette-empty"
          title="조건에 맞는 식당이 없어요"
          description={
            <>
              <strong>
                {categories.length > 0 ? categories.join(' · ') : '전체'}
              </strong>{' '}
              ·{' '}
              <strong>{sheetType === 'lunch' ? '점심' : '저녁회식'}</strong>{' '}
              조건의 식당이 없습니다. 조건을 줄여 보세요.
            </>
          }
          primaryAction={{
            label: '조건 변경',
            onClick: onReset,
          }}
        />
      )}
    </div>
  )
}

function ResultDisplay({
  result,
  stats,
  candidates,
  onAgain,
  onGo,
}: {
  result: Restaurant
  stats: RestaurantWithStats | null
  candidates: string[]
  onAgain: () => void
  onGo: (id: string) => void
}) {
  const hasCoord = result.lat !== null && result.lng !== null
  const avg = stats?.avg_score ?? null
  const count = stats?.rating_count ?? 0

  // 결과 위/아래에 흐릿하게 보이는 다른 후보 이름 (slot-fade).
  // 결과 식당 외 다른 후보 중 무작위로 2개.
  const others = candidates.filter((n) => n !== result.name)
  const fadeAbove = others[0] ?? '…'
  const fadeBelow = others[1] ?? others[0] ?? '…'
  return (
    <div className="space-y-3">
      {/* 슬롯 결과 표시 — confetti와 함께 */}
      <div className="relative pt-7 text-center">
        <Confetti />
        <p className="mb-2 text-sm font-extrabold tracking-widest text-brand-accent">
          🎉 당첨!
        </p>
        <div className="relative mx-auto overflow-hidden rounded-2xl border-[3px] border-brand-accent bg-white px-4 py-2 shadow-xl shadow-orange-300/30">
          <span
            className="absolute -top-2 left-2 rotate-[-15deg] text-xl"
            aria-hidden
          >
            ⭐
          </span>
          <span
            className="absolute -top-2 right-2 rotate-[15deg] text-xl"
            aria-hidden
          >
            🎯
          </span>
          <div
            className="h-[22px] truncate text-[13px] font-bold leading-[22px] text-ink-300"
            aria-hidden
          >
            {fadeAbove}
          </div>
          <div className="py-2 text-2xl font-extrabold tracking-tight text-brand-accent">
            {result.name}
          </div>
          <div
            className="h-[22px] truncate text-[13px] font-bold leading-[22px] text-ink-300"
            aria-hidden
          >
            {fadeBelow}
          </div>
        </div>
      </div>

      <article className="space-y-2 rounded-2xl border border-surface-border-soft bg-white p-4 shadow-sm">
        <h2 className="text-lg font-extrabold text-ink-900">{result.name}</h2>
        {count > 0 && (
          <div className="text-sm font-extrabold text-brand-accent">
            ★ {avg !== null ? avg.toFixed(1) : '—'}
            <span className="ml-1 text-xs font-medium text-ink-500">
              · {count}명 평가
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryChip label={result.category} />
          <CategoryChip
            label={result.sheet_type === 'lunch' ? '점심' : '저녁회식'}
          />
        </div>
        {result.menu && (
          <p className="whitespace-pre-line pt-1 text-sm leading-relaxed text-ink-700">
            {result.menu}
          </p>
        )}

        {hasCoord ? (
          <div className="h-44 overflow-hidden rounded-card border border-surface-border bg-surface-muted">
            <KakaoMapView
              markers={[
                {
                  id: result.id,
                  lat: result.lat as number,
                  lng: result.lng as number,
                  title: result.name,
                },
              ]}
              center={{
                lat: result.lat as number,
                lng: result.lng as number,
              }}
              level={3}
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-surface-border bg-surface-muted p-3 text-center text-xs text-ink-500">
            📍 위치 미등록 — 상세 페이지에서 네이버 지도 링크를 확인해 주세요.
          </div>
        )}
      </article>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onGo(result.id)}
          className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-button bg-brand-accent text-base font-bold text-white shadow-lg shadow-orange-300/40 transition active:scale-[0.98]"
        >
          <Icon name="utensils" size={18} />
          이 식당 갈래!
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-button border-[1.5px] border-brand-primary bg-white text-base font-bold text-brand-primary hover:bg-surface-muted"
        >
          <Icon name="refresh" size={18} />
          다시 굴리기
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
 * 보조 컴포넌트
 * ────────────────────────────────────────────────────────── */
function ConditionCrumb({
  sheetType,
  categories,
  disabled = false,
  onEdit,
}: {
  sheetType: SheetType
  categories: Category[]
  disabled?: boolean
  onEdit?: () => void
}) {
  return (
    <div className="-mx-4 flex items-center justify-between border-b border-surface-border-soft bg-brand-primary-soft px-4 py-2 text-xs text-brand-primary-dark">
      <div>
        <strong>
          {categories.length > 0 ? categories.join(' · ') : '전체'}
        </strong>{' '}
        · {sheetType === 'lunch' ? '점심' : '저녁회식'}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-brand-primary disabled:opacity-45"
        >
          조건 변경
        </button>
      )}
      {!onEdit && (
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-brand-primary opacity-45">
          조건 변경
        </span>
      )}
    </div>
  )
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-surface-muted p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
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
  )
}

/** 결과 출현 시 한 번 뿌려지는 점 8개 — 절대 위치, 키프레임으로 펑.
 *  부모(ResultDisplay)가 결과 mutation마다 remount되므로 키프레임이 매번 재실행됨.
 */
function Confetti() {
  type Dot = {
    top?: number
    bottom?: number
    left?: string
    right?: string
    bg: string
    big?: boolean
  }
  const dots: Dot[] = [
    { top: 6, left: '8%', bg: '#ff6b35' },
    { top: 18, left: '78%', bg: '#1d9e75' },
    { top: 38, left: '20%', bg: '#f4a700' },
    { top: 50, left: '68%', bg: '#2e75b6' },
    { top: 8, left: '46%', bg: '#ff6b35', big: true },
    { bottom: 14, left: '12%', bg: '#1d9e75' },
    { bottom: 24, right: '12%', bg: '#f4a700' },
    { bottom: 4, left: '52%', bg: '#2e75b6', big: true },
  ]
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {dots.map((d, i) => {
        // 각 점마다 다른 방향으로 튀게.
        const angle = (i / dots.length) * Math.PI * 2
        const dist = 24 + (i % 3) * 8
        const x = `${Math.cos(angle) * dist}px`
        const y = `${Math.sin(angle) * dist - 10}px`
        return (
          <span
            key={i}
            className="confetti-dot"
            style={
              {
                top: d.top,
                bottom: d.bottom,
                left: d.left,
                right: d.right,
                background: d.bg,
                width: d.big ? 5 : 6,
                height: d.big ? 5 : 6,
                animationDelay: `${i * 30}ms`,
                ['--confetti-x']: x,
                ['--confetti-y']: y,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
