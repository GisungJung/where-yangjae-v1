/**
 * 양재어디가 — Supabase DB 타입.
 *
 * 본 파일은 원격 스키마를 기준으로 `supabase gen types typescript`(또는 MCP)
 * 결과를 그대로 채택한다. 단, 아래 마이그레이션이 아직 원격에 적용되지 않은
 * 상태이므로 수동으로 보강된 항목이 있다:
 *   - 20260515000002_rating_photos_and_storage.sql → `rating_photos` 테이블 수동 추가
 *
 * 원격 재생성 시점에 보강분이 자동 생성 결과에 흡수되면 수동 블록을 제거하면 된다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          restaurant_id: string
          reviewer_id: string
          score: number
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          restaurant_id: string
          reviewer_id: string
          score: number
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          restaurant_id?: string
          reviewer_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ratings_restaurant_id_fkey'
            columns: ['restaurant_id']
            isOneToOne: false
            referencedRelation: 'restaurant_stats'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ratings_restaurant_id_fkey'
            columns: ['restaurant_id']
            isOneToOne: false
            referencedRelation: 'restaurants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ratings_reviewer_id_fkey'
            columns: ['reviewer_id']
            isOneToOne: false
            referencedRelation: 'reviewers'
            referencedColumns: ['id']
          },
        ]
      }
      restaurants: {
        Row: {
          category: string
          created_at: string
          direction: string | null
          id: string
          kakao_place_id: string | null
          lat: number | null
          lng: number | null
          menu: string | null
          name: string
          naver_url: string | null
          note: string | null
          registered_by: string | null
          sheet_type: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          direction?: string | null
          id?: string
          kakao_place_id?: string | null
          lat?: number | null
          lng?: number | null
          menu?: string | null
          name: string
          naver_url?: string | null
          note?: string | null
          registered_by?: string | null
          sheet_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          direction?: string | null
          id?: string
          kakao_place_id?: string | null
          lat?: number | null
          lng?: number | null
          menu?: string | null
          name?: string
          naver_url?: string | null
          note?: string | null
          registered_by?: string | null
          sheet_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'restaurants_registered_by_fkey'
            columns: ['registered_by']
            isOneToOne: false
            referencedRelation: 'reviewers'
            referencedColumns: ['id']
          },
        ]
      }
      reviewers: {
        Row: {
          created_at: string
          id: string
          nickname: string
        }
        Insert: {
          created_at?: string
          id?: string
          nickname: string
        }
        Update: {
          created_at?: string
          id?: string
          nickname?: string
        }
        Relationships: []
      }
      // ── 수동 보강: 20260515000002_rating_photos_and_storage.sql ─────────────
      // 원격 적용 전이라 generate 결과에 빠져 있음. 마이그레이션 SQL과 1:1 매칭.
      rating_photos: {
        Row: {
          byte_size: number | null
          created_at: string
          height: number | null
          id: string
          rating_id: string
          sort_order: number
          storage_path: string
          width: number | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          rating_id: string
          sort_order?: number
          storage_path: string
          width?: number | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          rating_id?: string
          sort_order?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'rating_photos_rating_id_fkey'
            columns: ['rating_id']
            isOneToOne: false
            referencedRelation: 'ratings'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      restaurant_stats: {
        Row: {
          avg_score: number | null
          id: string | null
          name: string | null
          rating_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      category_counts: {
        Args: { p_sheet_type?: string }
        Returns: {
          category: string
          count: number
        }[]
      }
      pick_random_restaurant: {
        Args: {
          p_categories?: string[]
          p_include_closed?: boolean
          p_sheet_type?: string
        }
        Returns: {
          category: string
          created_at: string
          direction: string | null
          id: string
          kakao_place_id: string | null
          lat: number | null
          lng: number | null
          menu: string | null
          name: string
          naver_url: string | null
          note: string | null
          registered_by: string | null
          sheet_type: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'restaurants'
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
