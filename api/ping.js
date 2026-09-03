/**
 * Supabase 무료 티어 일시정지(7일 무요청 시 pause) 방지용 keep-alive 핑.
 * Vercel Cron(vercel.json의 crons)이 매일 1회 호출한다 — 장기 연휴에도 활동 유지.
 *
 * regions 1행만 조회하는 최소 REST 요청이라 egress 영향은 무시 가능.
 * VITE_ 접두사 env는 Vercel 프로젝트 env를 그대로 재사용 (서버 함수에서도 접근 가능).
 */
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'Supabase env 미설정' })
    return
  }

  try {
    const r = await fetch(`${url}/rest/v1/regions?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status })
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
