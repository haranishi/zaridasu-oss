import type { Page } from '@playwright/test'

const api = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co').replace(/\/+$/, '')
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG3sAAAAASUVORK5CYII=', 'base64')

export function syntheticMapPosts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    lat: Number((39.72 + Math.floor(index / 40) * 0.001).toFixed(3)),
    lng: Number((140.1 + index % 40 * 0.001).toFixed(3)),
    species: 'american', info_type: 'sighting', municipality: '秋田市',
    comment: `合成の公開観察 ${index + 1}`, photos: ['/images/american.png'],
    created_at: '2026-10-11T00:00:00Z', user_id: '00000000-0000-0000-0000-000000000000',
    is_anonymous: true, is_official: false, count: 1, observed_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
    survey_duration_minutes: 30, locality: '合成地区', water_body: '合成川',
    is_on_water: true, elevation_m: 10, geo_enriched_at: '2026-10-11T00:00:00Z', geo_source: 'osm',
  }))
}

export async function prepareMapPosts(page: Page, posts = syntheticMapPosts(1), origin = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`) {
  const postQueries: URL[] = []
  const unexpected: string[] = []
  await page.addInitScript(() => {
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
    localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_map_layer', 'osm')
  })
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.origin === new URL(origin).origin) return route.continue()
    if (/^(?:[abc]\.tile\.openstreetmap\.org|cyberjapandata\.gsi\.go\.jp)$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
    }
    if (url.origin === new URL(api).origin) {
      if (url.pathname === '/rest/v1/posts' && request.method() === 'GET') {
        postQueries.push(url)
        const columns = (url.searchParams.get('select') ?? '').split(',').map(column => column.trim().split(':')[0]!)
        const limit = Number(url.searchParams.get('limit') ?? 50)
        return json(posts.slice(0, limit).map(post => Object.fromEntries(columns.map(column => [column, post[column as keyof typeof post]]))))
      }
      if (url.pathname === '/rest/v1/survey_requests' && request.method() === 'GET') {
        return json([{ id: '00000000-0000-0000-0000-000000002001', lat: 39.8, lng: 140.25, municipality: '秋田市', reason: '合成の調査依頼', created_at: '2026-10-11T00:00:00Z', urgency: 'normal', status: 'open' }])
      }
      if (url.pathname === '/rest/v1/rpc/get_dashboard_stats') return json({ total_posts: posts.length, species_counts: [], info_type_counts: [], monthly_data: [], municipality_counts: [] })
      if (url.pathname.startsWith('/auth/v1/')) return json({ message: 'fixture signed out' }, 401)
    }
    unexpected.push(`${request.method()} ${url.hostname}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return { postQueries, unexpected }
}
