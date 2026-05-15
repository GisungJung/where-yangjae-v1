/**
 * 양재어디가 — 도메인 Zod 스키마
 *
 * 기획서 §6 데이터 모델을 그대로 매핑한다.
 * - DB(`src/types/database.ts`)에서 가져온 raw row를 `parse`로 검증해서 사용.
 * - 컬럼 enum/제약은 기획서 §6.2~§6.4 기준.
 *
 * 주의: DB 마이그레이션이 아직 적용되지 않았을 수 있다.
 *       이 타입은 컨트랙트 역할이며, 실제 컬럼 타입은 dba가 SQL을 적용한 뒤
 *       Supabase로부터 생성된 타입과 교차 검증해야 한다.
 */

import { z } from 'zod'

/* ──────────────────────────────────────────────────────────
 * 1. enum 정의 (기획서 §6.2)
 * ────────────────────────────────────────────────────────── */

export const CATEGORIES = [
  '한식',
  '일식',
  '중식',
  '분식',
  '패스트푸드',
  '아시안',
  '카페',
  '기타',
] as const
export type Category = (typeof CATEGORIES)[number]
export const CategorySchema = z.enum(CATEGORIES)

// `direction` 컬럼/스키마 제거됨 (task #15·#16 — 비즈데이터 회사 위치 기준이라 일반화 불가).

export const SHEET_TYPES = ['lunch', 'dinner'] as const
export type SheetType = (typeof SHEET_TYPES)[number]
export const SheetTypeSchema = z.enum(SHEET_TYPES)

export const RESTAURANT_STATUSES = ['운영중', '휴업', '폐업'] as const
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number]
export const RestaurantStatusSchema = z.enum(RESTAURANT_STATUSES)

/* ──────────────────────────────────────────────────────────
 * 2. Restaurant
 * ────────────────────────────────────────────────────────── */

export const RestaurantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  category: CategorySchema,
  menu: z.string().nullable().default(null),
  sheet_type: SheetTypeSchema,
  naver_url: z.string().url().nullable().default(null),
  note: z.string().nullable().default(null),
  status: RestaurantStatusSchema.default('운영중'),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  kakao_place_id: z.string().nullable().default(null),
  registered_by: z.string().uuid().nullable().default(null),
  created_at: z.string(), // ISO timestamptz
  // DB는 NOT NULL DEFAULT now() + BEFORE UPDATE 트리거로 자동 갱신.
  updated_at: z.string(),
})
export type Restaurant = z.infer<typeof RestaurantSchema>

/* ──────────────────────────────────────────────────────────
 * 3. Reviewer
 * ────────────────────────────────────────────────────────── */

export const ReviewerSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().min(1).max(20),
  created_at: z.string(),
})
export type Reviewer = z.infer<typeof ReviewerSchema>

/* ──────────────────────────────────────────────────────────
 * 4. Rating (0~5, 0.5 단위)
 * ────────────────────────────────────────────────────────── */

const halfStep = (value: number) => Math.round(value * 2) === value * 2

/**
 * DB row의 score 검증용 — 기존 데이터에 0점이 있을 수 있어 하한 0 유지.
 * (RatingSchema가 사용)
 */
export const RatingScoreSchema = z
  .number()
  .min(0)
  .max(5)
  .refine(halfStep, { message: '0.5점 단위로 입력해 주세요.' })

/**
 * 사용자 입력용 — 별 선택 전에 폼이 제출되는 사고 차단을 위해 최솟값 0.5.
 * (NewRatingInputSchema·인라인 수정 폼에서 사용)
 */
export const RatingScoreInputSchema = z
  .number({ message: '별점을 선택해 주세요.' })
  .min(0.5, '별점은 최소 0.5점이어야 해요.')
  .max(5)
  .refine(halfStep, { message: '0.5점 단위로 입력해 주세요.' })

export const RatingSchema = z.object({
  id: z.string().uuid(),
  restaurant_id: z.string().uuid(),
  reviewer_id: z.string().uuid(),
  score: RatingScoreSchema,
  comment: z.string().max(200).nullable().default(null),
  created_at: z.string(),
  // DB는 NOT NULL DEFAULT now() + BEFORE UPDATE 트리거로 자동 갱신.
  updated_at: z.string(),
})
export type Rating = z.infer<typeof RatingSchema>

/** UI 표시용: 평가 + 닉네임 조인 결과 */
export const RatingWithReviewerSchema = RatingSchema.extend({
  reviewer: z.object({
    id: z.string().uuid(),
    nickname: z.string(),
  }),
})
export type RatingWithReviewer = z.infer<typeof RatingWithReviewerSchema>

/* ──────────────────────────────────────────────────────────
 * 4.5 RatingPhoto (task #11·#12) — rating당 0~3장
 * ────────────────────────────────────────────────────────── */

export const RatingPhotoSchema = z.object({
  id: z.string().uuid(),
  rating_id: z.string().uuid(),
  storage_path: z.string(),
  sort_order: z.number().int().min(0).max(2),
  byte_size: z.number().int().nonnegative().nullable().default(null),
  width: z.number().int().nonnegative().nullable().default(null),
  height: z.number().int().nonnegative().nullable().default(null),
  created_at: z.string(),
})
export type RatingPhoto = z.infer<typeof RatingPhotoSchema>

/* ──────────────────────────────────────────────────────────
 * 5. RestaurantStats (뷰: 기획서 §6.5)
 * ────────────────────────────────────────────────────────── */

export const RestaurantStatsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rating_count: z.number().int().nonnegative(),
  avg_score: z.number().nullable(),
})
export type RestaurantStats = z.infer<typeof RestaurantStatsSchema>

/** 카드 표시용: 식당 본체 + 평점 집계 */
export type RestaurantWithStats = Restaurant & {
  rating_count: number
  avg_score: number | null
}

/* ──────────────────────────────────────────────────────────
 * 6. 평가 입력 폼 스키마 (UI)
 * ────────────────────────────────────────────────────────── */

export const NewRatingInputSchema = z.object({
  nickname: z
    .string()
    .min(1, '닉네임을 입력해 주세요.')
    .max(20, '닉네임은 20자 이하여야 합니다.'),
  score: RatingScoreInputSchema,
  comment: z
    .string()
    .max(200, '한줄평은 200자 이하여야 합니다.')
    .optional()
    .or(z.literal('')),
})
export type NewRatingInput = z.infer<typeof NewRatingInputSchema>

/* ──────────────────────────────────────────────────────────
 * 7. 맛집 등록 폼 스키마 (기획서 §8.4)
 * ────────────────────────────────────────────────────────── */

export const NewRestaurantInputSchema = z.object({
  name: z
    .string()
    .min(1, '상호명을 입력해 주세요.')
    .max(100, '상호명은 100자 이하여야 합니다.'),
  category: CategorySchema,
  sheet_type: SheetTypeSchema,
  menu: z
    .string()
    .max(500, '메뉴는 500자 이하여야 합니다.')
    .optional()
    .or(z.literal('')),
  note: z
    .string()
    .max(600, '비고는 600자 이하여야 합니다.')
    .optional()
    .or(z.literal('')),
  naver_url: z
    .string()
    .url('올바른 URL을 입력해 주세요.')
    .optional()
    .or(z.literal('')),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  kakao_place_id: z.string().nullable().default(null),
  nickname: z
    .string()
    .min(1, '등록자 닉네임을 입력해 주세요.')
    .max(20, '닉네임은 20자 이하여야 합니다.'),
})
export type NewRestaurantInput = z.infer<typeof NewRestaurantInputSchema>
