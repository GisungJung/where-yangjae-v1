/**
 * 양재어디가 — Supabase DB 타입 (수동 stub).
 *
 * TODO(원격 적용 후):
 *   `npx supabase login` → `npx supabase gen types typescript --project-id hkmtclkeuscfvmtvnzwn --schema public > src/types/database.ts`
 *   로 자동 생성된 타입으로 교체. 새 객체(rating_photos·restaurant_stats 변경·
 *   ratings_rate_limit 트리거 등)는 자동 반영된다.
 *
 * 마이그레이션 산출물과 동기 상태를 유지: 도메인 Zod 타입을 재사용하여 컴파일 타임
 * 컨트랙트만 맞춰둔다.
 */

import type {
  Rating,
  RatingPhoto,
  Restaurant,
  RestaurantStats,
  Reviewer,
} from './domain'

export type Database = {
  public: {
    Tables: {
      restaurants: {
        Row: Restaurant
        Insert: Omit<
          Restaurant,
          'id' | 'created_at' | 'updated_at' | 'status'
        > & {
          id?: string
          created_at?: string
          updated_at?: string
          status?: Restaurant['status']
        }
        Update: Partial<Omit<Restaurant, 'id' | 'created_at'>>
      }
      reviewers: {
        Row: Reviewer
        Insert: Omit<Reviewer, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Reviewer, 'id' | 'created_at'>>
      }
      ratings: {
        Row: Rating
        Insert: Omit<Rating, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Rating, 'id' | 'created_at'>>
      }
      rating_photos: {
        Row: RatingPhoto
        Insert: Omit<RatingPhoto, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<RatingPhoto, 'id' | 'created_at' | 'rating_id'>>
      }
    }
    Views: {
      restaurant_stats: {
        Row: RestaurantStats
      }
    }
    Functions: {
      /**
       * 룰렛 페이지(`/roulette`)용 랜덤 추천 RPC.
       *
       * dba 영역. dev는 시그니처만 가지고 호출한다.
       * - p_sheet_type: 'lunch'|'dinner' 또는 null(전체)
       * - p_categories: 카테고리 배열 또는 null(전체)
       * - p_include_closed: 휴업/폐업 포함 여부 (기본 false)
       * 반환: 매칭 식당 0건이면 null, 1건이면 restaurants Row.
       */
      pick_random_restaurant: {
        Args: {
          p_sheet_type: 'lunch' | 'dinner' | null
          p_categories: string[] | null
          p_include_closed: boolean
        }
        Returns: Restaurant | null
      }
      /**
       * 카테고리별 식당 수 집계 RPC.
       * sheet_type 필터(점심/저녁)에 따라 카운트가 달라진다.
       * - p_sheet_type: 'lunch'|'dinner' 또는 null(전체)
       * 반환: 카테고리·count 배열 (운영중 식당 기준).
       */
      category_counts: {
        Args: { p_sheet_type: string | null }
        Returns: { category: string; count: number }[]
      }
    }
    Enums: Record<string, never>
  }
}
