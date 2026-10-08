# 식당 사진 (최대 3장 + 대표 1장) — 설계

- 작성일: 2026-10-07
- 배경: 평가 사진(rating_photos)은 구현됐으나 `RatingForm`의 토글로 UI 비활성 상태.
  평가마다 사진이 쌓이면 용량이 커지므로 **식당 단위**로 전환한다. 평가 사진은 계속 비활성.

## 1. 결정 사항

- 식당당 최대 3장, 대표 1장. 누구나 추가·삭제·대표 변경 (식당 정보 수정 권한과 동일).
- 등록·수정 화면 모두에서 편집 — 기존 ~80개 식당도 사진을 채울 수 있게.

## 2. 화면

| 위치 | 동작 |
|---|---|
| 등록·수정 폼 | `RestaurantPhotoEditor` — 사진 추가(최대 3) / ✕ 제거 / ★ 대표 지정. 첫 사진이 기본 대표. 제출 시 일괄 반영 |
| 목록 카드 (모바일·데스크톱 공통) | 상단 이름·별점(전체 폭), 하단 [대표 사진 72px][배지·메뉴·비고] (10-08). 사진 없으면 정보 영역이 전체 폭 |
| 상세 | 헤더 아래 3열 사진 그리드(대표 먼저), 클릭 시 원본 새 탭 |

## 3. 데이터

- 테이블 `restaurant_photos` (schema.sql §2.4b): `restaurant_id`(CASCADE), `storage_path`, `thumb_path`,
  `sort_order` 0~2 + UNIQUE(restaurant_id, sort_order), `is_cover`, 크기 메타.
- 대표 규칙: `is_cover=true` 행, 없으면 sort_order 최소 행 (`pickCover`).
- 저장 계획(`planPhotoSave`): 편집기에서 빠진 기존 사진 삭제 → 신규는 비어있는 sort_order에 배정 → 대표 지정.
- 버킷 `restaurant-photos` (public, 300KB, JPEG). 원본 1024px + 썸네일 240px(~15KB).
  목록은 썸네일만 로드 — 80개 기준 ~1-2MB (원본이면 ~15MB). cacheControl 7일.
- Storage 정리: 트리거 대신 클라이언트가 행 삭제 후 `storage.remove()` (Supabase의
  storage.objects 직접 DELETE 차단 대응). 버킷 범위 DELETE 정책 허용.
- 업로드: Storage(원본·썸네일) → DB row. row 실패 시 객체 정리.
- 조회: 전체 사진 1쿼리(최대 240행) → 식당별 그룹 (`useRestaurantPhotoMap`), 카드들이 캐시 공유.
- 폴백: 테이블 미적용 시 빈 배열 → 사진 없이 기존 화면. 저장 시엔 경고 alert(식당 저장은 유지).

## 4. 용량 추정

80곳 × 3장 × ~230KB ≈ 55MB (무료 1GB의 ~5%).

## 5. 테스트

- `src/utils/restaurantPhotos.test.ts` — pickCover / groupPhotosByRestaurant / planPhotoSave.
