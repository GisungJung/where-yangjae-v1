/**
 * 지역 기준점(regions) 조회.
 *
 * - 테이블이 아직 없을 수 있는 상태(마이그레이션 20260903000001 미적용)를
 *   가정해, 조회 실패 시 기존 두 지역 폴백 상수를 반환한다 — 화면은 기존과
 *   동일하게 동작 (restaurants.ts의 방어적 폴백 패턴과 동일).
 * - 지역 추가는 관리자 SQL INSERT — 클라이언트 쓰기 API 없음.
 */

import { supabase } from '../lib/supabase'
import { RegionSchema, type Region } from '../types/domain'

/** 마이그레이션 미적용 시 폴백 — 시드(20260903000001)와 동일 값. */
export const FALLBACK_REGIONS: Region[] = [
  { name: '양재', lat: 37.4842, lng: 127.0344, sort_order: 1 },
  { name: '남부터미널', lat: 37.4765, lng: 127.0048, sort_order: 2 },
]

/** 지역 기준점 전체 (sort_order 순). 테이블 부재 시 폴백 상수. */
export async function fetchRegions(): Promise<Region[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.warn(
      '[regions] 조회 실패 — 폴백 지역 상수를 사용합니다 (마이그레이션 미적용?).',
      error.message,
    )
    return FALLBACK_REGIONS
  }

  const regions = (data ?? [])
    .map((row) => RegionSchema.safeParse(row))
    .flatMap((r) => (r.success ? [r.data] : []))

  // 테이블은 있는데 비어 있는 비정상 상태도 폴백 — 지역 필터가 통째로 사라지는 것 방지.
  return regions.length > 0 ? regions : FALLBACK_REGIONS
}
