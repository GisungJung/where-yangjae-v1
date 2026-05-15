/**
 * 사진 클라이언트 리사이즈 (task #12)
 *
 * dba 분석안:
 * - `createImageBitmap(file, { imageOrientation: 'from-image' })` — EXIF Orientation 자동 적용
 * - 최대 변 1024px, contain-fit
 * - `canvas.toBlob('image/jpeg', 0.8)` — JPEG q=0.8 → 보통 100~250KB
 * - 300KB 초과 시 q=0.7 재시도, 그래도 초과면 사용자 친화 에러 throw
 * - EXIF GPS 등 메타는 canvas 재인코딩으로 자연 stripped
 *
 * HEIC 데스크탑 디코드 실패는 createImageBitmap이 reject — 호출부에서 캐치하여
 * "지원하지 않는 형식, 모바일 또는 JPEG/PNG/WebP 사용" 메시지로 변환.
 */

const MAX_DIMENSION = 1024
const MAX_BYTES = 300 * 1024 // 307200 (Storage 버킷 file_size_limit과 동일)
const PRIMARY_QUALITY = 0.8
const FALLBACK_QUALITY = 0.7
const OUTPUT_MIME = 'image/jpeg'

export interface ResizedImage {
  blob: Blob
  /** 출력 이미지 폭(px) */
  width: number
  /** 출력 이미지 높이(px) */
  height: number
  /** 출력 바이트 — DB row의 byte_size로 저장 */
  bytes: number
  /** 적용된 JPEG quality (디버깅·로그용) */
  quality: number
}

export class UnsupportedImageFormatError extends Error {
  // `public original?` parameter property는 erasableSyntaxOnly 설정에 막혀서
  // 명시적 필드 + 생성자 대입 형태로 분리.
  readonly original?: unknown
  constructor(original?: unknown) {
    super('지원하지 않는 이미지 형식입니다. 모바일 사진이거나 JPEG·PNG·WebP를 사용해 주세요.')
    this.name = 'UnsupportedImageFormatError'
    this.original = original
  }
}

export class OversizedImageError extends Error {
  readonly actualBytes: number
  constructor(actualBytes: number) {
    super(
      `이미지가 너무 큽니다 (${Math.round(actualBytes / 1024)}KB). 작은 이미지를 사용해 주세요.`,
    )
    this.name = 'OversizedImageError'
    this.actualBytes = actualBytes
  }
}

/**
 * 사진 파일을 1024px·JPEG q=0.8로 리사이즈해 Blob 반환.
 * - 실패(HEIC 디코드 불가 등) → `UnsupportedImageFormatError`
 * - q=0.7 재시도 후에도 300KB 초과 → `OversizedImageError`
 */
export async function resizePhoto(file: File): Promise<ResizedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    throw new UnsupportedImageFormatError(err)
  }

  try {
    const { width: targetW, height: targetH } = scaleContain(
      bitmap.width,
      bitmap.height,
      MAX_DIMENSION,
    )

    // OffscreenCanvas가 있으면 사용 (워커·메인 모두에서 가능, 메모리 효율).
    // 미지원 환경(Safari 구버전 등)은 일반 <canvas> 폴백.
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement('canvas'), {
            width: targetW,
            height: targetH,
          })

    // getContext('2d')의 반환 타입 유니언이 ImageBitmapRenderingContext까지 포함하지만,
    // '2d' 인자로 호출 시 실제로는 (Offscreen)CanvasRenderingContext2D만 나옴.
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
      '2d',
    ) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) {
      throw new UnsupportedImageFormatError('canvas 2d 컨텍스트 생성 실패')
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)

    // 1차 시도: q=0.8
    let blob = await canvasToBlob(canvas, OUTPUT_MIME, PRIMARY_QUALITY)
    let quality = PRIMARY_QUALITY
    if (blob.size > MAX_BYTES) {
      // 2차 시도: q=0.7
      blob = await canvasToBlob(canvas, OUTPUT_MIME, FALLBACK_QUALITY)
      quality = FALLBACK_QUALITY
    }
    if (blob.size > MAX_BYTES) {
      throw new OversizedImageError(blob.size)
    }

    return {
      blob,
      width: targetW,
      height: targetH,
      bytes: blob.size,
      quality,
    }
  } finally {
    // ImageBitmap close — 메모리 누수 차단.
    bitmap.close?.()
  }
}

function scaleContain(
  srcW: number,
  srcH: number,
  maxDim: number,
): { width: number; height: number } {
  if (srcW <= maxDim && srcH <= maxDim) {
    return { width: srcW, height: srcH }
  }
  const ratio = srcW >= srcH ? maxDim / srcW : maxDim / srcH
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  }
}

/** OffscreenCanvas와 HTMLCanvasElement 양쪽 처리. 비동기 Blob 반환. */
function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    // OffscreenCanvas
    return canvas.convertToBlob({ type: mime, quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new UnsupportedImageFormatError('canvas.toBlob returned null'))
      },
      mime,
      quality,
    )
  })
}

/**
 * Storage 객체 경로용 짧은 id 생성 — nanoid 의존성 없이 web crypto API 사용.
 * 96bit 엔트로피 → base36 ~19자. 충돌 확률 무시 가능.
 *
 * dba 통지: storage.objects 정책의 regex `^<uuid>/[^/]+$`가 슬래시만 막으므로
 * base36 영숫자는 안전.
 */
export function shortRandomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let acc = 0n
  for (const b of bytes) acc = (acc << 8n) | BigInt(b)
  return acc.toString(36)
}
