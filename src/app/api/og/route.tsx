import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { getSpecies, DEFAULT_SPECIES_EMOJI } from '@/lib/constants'

export const runtime = 'nodejs'

export const TITLE_MAX = 80
export const AREA_MAX = 40

export function sanitizeOgParams(params: {
  title?: string | null
  species?: string | null
  area?: string | null
}): { title: string; area: string; emoji: string } {
  const rawTitle = params.title ?? ''
  const rawSpecies = params.species ?? ''
  const rawArea = params.area ?? ''
  const title = rawTitle.trim().slice(0, TITLE_MAX) || 'ザリダス'
  const area = rawArea.trim().slice(0, AREA_MAX) || '秋田県'
  const matched = getSpecies(rawSpecies)
  const emoji = matched?.emoji ?? DEFAULT_SPECIES_EMOJI
  return { title, area, emoji }
}

// REQ-216 FR-216-05: この Route は <img> / OGP のクロスオリジン GET でのみ消費され、
// ブラウザの fetch + クレデンシャル付き CORS 経路では使われないため、CORS ヘッダは
// 付与しない (同一オリジン完結方針 = 最も安全)。ワイルドカード Access-Control-Allow-Origin: *
// は本番では使わないこと。将来 /api/* を外部オリジンの fetch から使わせる必要が出た場合は、
// 許可オリジンの明示リストを用意し、リクエストの Origin がリストと一致する時だけ
// Access-Control-Allow-Origin にそのオリジンを反映する方式にする (ワイルドカード不可)。
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const { title, area, emoji } = sanitizeOgParams({
    title: searchParams.get('title'),
    species: searchParams.get('species'),
    area: searchParams.get('area'),
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* ロゴ・エモジ */}
        <div style={{ fontSize: 80, marginBottom: 20, display: 'flex' }}>
          {emoji}
        </div>

        {/* タイトル */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            maxWidth: '80%',
            lineHeight: 1.3,
            display: 'flex',
          }}
        >
          {title}
        </div>

        {/* 地域名 */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 16,
            display: 'flex',
          }}
        >
          {area}
        </div>

        {/* サイト名 */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 24,
            color: 'rgba(255,255,255,0.6)',
            display: 'flex',
          }}
        >
          ザリダス - 秋田県外来生物情報マップ
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    }
  )
}
