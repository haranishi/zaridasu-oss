import { test, expect, type BrowserContext, type Locator, type Page, type Route, type TestInfo } from '@playwright/test'
import { geometryFixture } from '../../src/features/water/lib/__fixtures__/geometry'
import { createWaterCandidates } from '../../src/features/water/lib/candidates'

const SUPABASE_ORIGIN = 'https://placeholder.supabase.co'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }
type Outcome = 'success' | 'degraded' | 'empty'
/** 画面下に固定で出る案内。重なりを調べる試験だけ1つを有効にし、ほかは最初から断っておく。 */
type Promo = 'signup' | 'intro' | 'install'
interface WaterOptions { promo?: Promo; features?: number; rustGeometry?: boolean; blockWasm?: boolean }
interface WaterCall { lat: number; lng: number; radius: number; outcome: Outcome }

test.use({ serviceWorkers: 'block' })

/** Real local Next/Leaflet; named external fixtures only, with no live API fallback. */
async function prepareWaterMap(page: Page, context: BrowserContext, baseURL: string, outcomes: Outcome[], options: WaterOptions = {}) {
  const localOrigin = new URL(baseURL).origin
  expect(new URL(baseURL).hostname, 'Water mocks must run on a local Next server').toMatch(/^(127\.0\.0\.1|localhost)$/)
  await context.clearCookies()
  await context.addInitScript((enabled: Promo | null) => {
    localStorage.setItem('zaridasu_lang', 'ja')
    if (enabled !== 'intro') localStorage.setItem('zaridasu_intro_optout_v1', '1')
    if (enabled !== 'signup') localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    if (enabled !== 'install') localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_onboarding_region_v1', 'central')
    localStorage.setItem('zaridasu_map_layer', 'osm')
  }, options.promo ?? null)
  const calls: WaterCall[] = []
  const unexpected: string[] = []
  const blockedWrites: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  let syntheticGeometry: ReturnType<typeof geometryFixture> | null = null
  let wasmRequests = 0
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /ErrorBoundary|hydration|didn't match|Minified React error|Invalid LatLng/i.test(message.text())) consoleErrors.push(message.text())
  })
  async function json(route: Route, body: unknown, status = 200) {
    await route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
  }
  async function reject(route: Route, write = false) {
    const request = route.request(), url = new URL(request.url())
    const description = `${request.method()} ${url.hostname}${url.pathname}`
    unexpected.push(description)
    if (write) blockedWrites.push(description)
    await route.abort('blockedbyclient')
  }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    if (url.origin === localOrigin) {
      if (!['GET', 'HEAD'].includes(method)) return reject(route, true)
      if (url.pathname.endsWith('.wasm')) {
        wasmRequests++
        if (options.blockWasm) return route.fulfill({ status: 503, body: '' })
      }
      if (url.pathname === '/api/nearby-water') {
        const outcome = outcomes[calls.length]
        const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng')), radius = Number(url.searchParams.get('radius'))
        if (!outcome || !Number.isFinite(lat) || !Number.isFinite(lng) || radius !== 1500) return reject(route)
        calls.push({ lat, lng, radius, outcome })
        const square = (x: number, y: number) => [[x - 0.001, y - 0.001], [x + 0.001, y - 0.001], [x + 0.001, y + 0.001], [x - 0.001, y + 0.001], [x - 0.001, y - 0.001]]
        // 一覧が最大の高さになる件数を指定できる（案内との重なりは、一覧が高いほど出やすい）。
        const many = (count: number) => Array.from({ length: count }, (_, i) => ({
          type: 'Feature', id: `way/${200 + i}`, properties: { name: `E2E 一覧の池 ${i + 1}` },
          geometry: { type: 'Polygon', coordinates: [square(lng + 0.0025 * (i - 5), lat + 0.002 * ((i % 4) - 1.5))] },
        }))
        if (options.rustGeometry) syntheticGeometry = geometryFixture(30, 64, 300, { lat, lng })
        const features = outcome !== 'success' ? [] : syntheticGeometry ? syntheticGeometry.features : options.features ? many(options.features) : [
          { type: 'Feature', id: 'way/101', properties: { name: 'E2E テスト池' }, geometry: { type: 'Polygon', coordinates: [square(lng, lat)] } },
          { type: 'Feature', id: 'relation/102', properties: { name: null }, geometry: { type: 'MultiPolygon', coordinates: [[square(lng + 0.005, lat + 0.004)], [square(lng - 0.005, lat - 0.004)]] } },
        ]
        return json(route, { type: 'FeatureCollection', features, meta: { ok: outcome !== 'degraded', degraded: outcome === 'degraded', count: features.length, truncated: false, radius, cached: false, source: outcome === 'degraded' ? 'unavailable' : 'overpass' } })
      }
      if (url.pathname.startsWith('/api/')) return reject(route)
      return route.continue()
    }
    if (method === 'GET' && (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname) || url.hostname === 'cyberjapandata.gsi.go.jp')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    }
    if (url.origin !== SUPABASE_ORIGIN) return reject(route, !['GET', 'HEAD', 'OPTIONS'].includes(method))
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS' } })
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_dashboard_stats') return json(route, { total_posts: 0, this_month_posts: 0, last_month_posts: 0, species_counts: [], info_type_counts: [], monthly_data: [], municipality_counts: [] })
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_undersurveyed_areas') return json(route, [])
    if (method === 'GET' && url.pathname === '/auth/v1/user') return json(route, { message: 'No E2E user session' }, 401)
    if (['GET', 'HEAD'].includes(method) && ['/rest/v1/posts', '/rest/v1/survey_requests', '/rest/v1/user_profiles', '/rest/v1/community_water_bodies'].includes(url.pathname)) {
      if (url.pathname === '/rest/v1/posts' && url.searchParams.get('select')?.replace(/\s/g, '') === 'display_lat,display_lng') {
        if (syntheticGeometry) {
          const points = syntheticGeometry.points.map(point => ({ display_lat: point.lat, display_lng: point.lng }))
          return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Range': `0-${points.length - 1}/${points.length}` }, contentType: 'application/json', body: JSON.stringify(points) })
        }
        return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Range': '*/0' }, contentType: 'application/json', body: '[]' })
      }
      return json(route, [])
    }
    return reject(route, !['GET', 'HEAD', 'OPTIONS'].includes(method))
  })
  await page.goto('/map')
  await expect(page.locator('.loading-screen')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '近くの水域を探す', exact: true })).toBeVisible({ timeout: 30_000 })
  return {
    calls,
    geometry: () => syntheticGeometry,
    wasmRequests: () => wasmRequests,
    async finish(testInfo: TestInfo) {
      await testInfo.attach('water-api-and-runtime', { body: JSON.stringify({ calls, unexpected, blockedWrites, pageErrors, consoleErrors }, null, 2), contentType: 'application/json' })
      expect(unexpected, 'Every API and external request must match a named fixture').toEqual([])
      expect(blockedWrites, 'No DB/Storage/Auth write or notification may be attempted').toEqual([])
      expect(pageErrors, 'No React/Leaflet/ErrorBoundary exception').toEqual([])
      expect(consoleErrors, 'No hydration or map runtime error').toEqual([])
    },
  }
}

for (const blockWasm of [false, true]) {
  test(`Rust水域計算: ${blockWasm ? 'Wasm取得失敗でも既存処理で表示する' : '本番CSPで実Wasmを実行し、公開記録件数が一致する'}`, async ({ page, context, baseURL }, testInfo) => {
    await context.addInitScript(() => {
      const state = window as unknown as { geometryRuns: { durationMs: number; output: number[] }[] }
      state.geometryRuns = []
      const original = Worker.prototype.postMessage
      Object.defineProperty(Worker.prototype, 'postMessage', {
        value(message: { id?: number; input?: Float64Array }, transfer: unknown) {
          if (message.input instanceof Float64Array) {
            const start = performance.now()
            const listener = (event: MessageEvent<{ id?: number; output?: Float64Array }>) => {
              if (event.data.id !== message.id) return
              this.removeEventListener('message', listener)
              if (event.data.output) state.geometryRuns.push({ durationMs: performance.now() - start, output: Array.from(event.data.output) })
            }
            this.addEventListener('message', listener)
          }
          return Reflect.apply(original, this, [message, transfer])
        },
      })
    })
    const mock = await prepareWaterMap(page, context, baseURL!, ['success'], { rustGeometry: true, blockWasm })
    expect(mock.wasmRequests(), 'Accelerator is absent from initial loading').toBe(0)
    await page.getByRole('button', { name: '近くの水域を探す', exact: true }).click()
    await expect(waterStatus(page).getByRole('button', { name: '非表示 · 30 件', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '水域の一覧', exact: true }).click()
    const panel = page.getByRole('region', { name: '近くの水域' })
    const fixture = mock.geometry()!
    const expected = createWaterCandidates(fixture.features, [], fixture.center, fixture.points, true)
    await expect.poll(() => panel.getByText('公開記録を確認できません', { exact: true }).count()).toBe(0)
    for (const candidate of expected) {
      const row = panel.getByRole('listitem').filter({ has: page.getByText(candidate.name!, { exact: true }) })
      const label = candidate.publicRecordCount === 0 ? '公開記録が見つからない候補' : `周辺の公開記録 ${candidate.publicRecordCount}件`
      await expect(row).toContainText(label)
    }
    const runs = await page.evaluate(() => (window as unknown as { geometryRuns: { durationMs: number; output: number[] }[] }).geometryRuns)
    expect(mock.wasmRequests()).toBeGreaterThan(0)
    if (blockWasm) expect(runs).toEqual([])
    else {
      expect(runs).toHaveLength(1)
      expect(runs[0]!.output).toHaveLength(30 * 8)
    }
    const response = await page.request.get('/')
    const policy = response.headers()['content-security-policy'] ?? ''
    expect(policy).toContain("'wasm-unsafe-eval'")
    expect(policy).not.toContain("'unsafe-eval'")
    await testInfo.attach('rust-worker-timings', { body: JSON.stringify({ blockWasm, runs, wasmRequests: mock.wasmRequests() }), contentType: 'application/json' })
    await mock.finish(testInfo)
  })
}

function waterPaths(page: Page) { return page.locator('.zari-map-main .leaflet-overlay-pane path[stroke="#1d4ed8"]') }
function searchRange(page: Page) { return page.locator('.zari-map-main .leaflet-overlay-pane path[stroke="#64748b"][stroke-dasharray]') }
function waterStatus(page: Page) { return page.getByRole('status').filter({ hasText: '地図の中心から半径1.5kmを検索' }) }
async function tileZoom(page: Page) {
  return page.locator('.zari-map-main .leaflet-tile-container').evaluateAll(containers => {
    // Leaflet retains earlier zoom levels during tile loading; DOM order is not the current view.
    const current = containers.reduce<Element | null>((highest, container) =>
      !highest || Number((container as HTMLElement).style.zIndex) > Number((highest as HTMLElement).style.zIndex) ? container : highest,
    null)
    const src = current?.querySelector('img')?.getAttribute('src')
    return Number(src?.match(/\/([0-9]+)\/[0-9]+\/[0-9]+\.png/)?.[1])
  })
}

for (const width of [390, 1440]) {
  test.describe(`近くの水域 (${width}px)`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('水域と検索範囲に拡大し、表示切替と失敗時の前回結果保持・再試行ができる', async ({ page, context, baseURL }, testInfo) => {
      const mock = await prepareWaterMap(page, context, baseURL!, ['success', 'degraded', 'success'])
      const initialZoom = await tileZoom(page)
      const find = page.getByRole('button', { name: '近くの水域を探す', exact: true })
      await find.click()
      const status = waterStatus(page)
      const hide = status.getByRole('button', { name: '非表示 · 2 件', exact: true })
      await expect(hide).toHaveAttribute('aria-pressed', 'true')
      await expect(waterPaths(page)).toHaveCount(2)
      await expect(searchRange(page)).toHaveCount(1)
      await expect.poll(() => tileZoom(page)).toBeGreaterThan(initialZoom)
      await expect.poll(async () => (await searchRange(page).boundingBox())?.width ?? 0).toBeGreaterThan(100)
      const mapBox = await page.locator('.zari-map-main').boundingBox()
      const rangeBox = await searchRange(page).boundingBox()
      expect(mapBox).not.toBeNull()
      expect(rangeBox).not.toBeNull()
      expect(rangeBox!.x).toBeGreaterThanOrEqual(mapBox!.x)
      expect(rangeBox!.x + rangeBox!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width)
      expect(rangeBox!.y).toBeGreaterThanOrEqual(mapBox!.y)
      expect(rangeBox!.y + rangeBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height)
      await hide.click()
      await expect(waterPaths(page)).toHaveCount(0)
      await expect(searchRange(page)).toHaveCount(0)
      const show = status.getByRole('button', { name: '表示 · 2 件', exact: true })
      await expect(show).toHaveAttribute('aria-pressed', 'false')
      await show.click()
      await expect(waterPaths(page)).toHaveCount(2)
      await expect(searchRange(page)).toHaveCount(1)
      expect(mock.calls).toHaveLength(1)
      await find.click()
      const retry = status.getByRole('button', { name: '再試行', exact: true })
      await expect(retry).toBeVisible()
      await expect(status.getByText('前回の検索結果', { exact: true })).toBeVisible()
      await expect(waterPaths(page)).toHaveCount(2)
      await expect(searchRange(page)).toHaveCount(1)
      await expect(hide).toHaveAttribute('aria-pressed', 'true')
      await retry.click()
      await expect(retry).toHaveCount(0)
      await expect(status.getByText('前回の検索結果', { exact: true })).toHaveCount(0)
      await expect(hide).toHaveAttribute('aria-pressed', 'true')
      await expect(waterPaths(page)).toHaveCount(2)
      await expect(searchRange(page)).toHaveCount(1)
      expect(mock.calls.map(call => call.outcome)).toEqual(['success', 'degraded', 'success'])
      await mock.finish(testInfo)
    })

    test('初回取得失敗を明示的に再試行し、未掲載の範囲も検索範囲付きで表示する', async ({ page, context, baseURL }, testInfo) => {
      const mock = await prepareWaterMap(page, context, baseURL!, ['degraded', 'empty'])
      await page.getByRole('button', { name: '近くの水域を探す', exact: true }).click()
      const status = waterStatus(page)
      const retry = status.getByRole('button', { name: '再試行', exact: true })
      await expect(retry).toBeVisible()
      await expect(status.getByText('前回の検索結果', { exact: true })).toHaveCount(0)
      await expect(waterPaths(page)).toHaveCount(0)
      await expect(searchRange(page)).toHaveCount(0)
      await retry.click()
      await expect(status.getByText('この範囲には登録された水域が見つかりませんでした', { exact: true })).toBeVisible()
      await expect(retry).toHaveCount(0)
      await expect(waterPaths(page)).toHaveCount(0)
      await expect(searchRange(page)).toHaveCount(1)
      await expect.poll(async () => (await searchRange(page).boundingBox())?.width ?? 0).toBeGreaterThan(100)
      expect(mock.calls.map(call => call.outcome)).toEqual(['degraded', 'empty'])
      await mock.finish(testInfo)
    })
  })
}

/** 一覧の見えている範囲で、一覧の外の要素が最前面になっている点を返す（空なら、見える範囲はすべて一覧が最前面）。 */
async function pointsCoveredOutsidePanel(panel: Locator) {
  return panel.evaluate(section => {
    const rect = section.getBoundingClientRect()
    const covered: string[] = []
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.15, 0.35, 0.55, 0.75, 0.9]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (!hit || !section.contains(hit)) covered.push(`(${Math.round(x)}, ${Math.round(y)}) ${hit?.closest('[data-bottom-promo]') ? 'bottom-promo' : (hit?.tagName.toLowerCase() ?? 'none')}`)
      }
    }
    return covered
  })
}

// 画面下に固定で出る案内（登録バナー・初回の誘い・インストール案内）は、地図より手前に出て一覧の下側を覆っていた。
// 実測では 390×667 で一覧の 69〜93%、デスクトップ幅の 1366×680 でも 38〜81% が隠れた。
// 案内ごとに、出ていること → 一覧を開くと隠れて一覧が最前面になること → 閉じると戻ることを確かめる。
const PROMO_CASES: { promo: Promo; width: number; height: number }[] = [
  { promo: 'signup', width: 390, height: 667 },
  { promo: 'intro', width: 390, height: 667 },
  { promo: 'install', width: 390, height: 667 },
  { promo: 'signup', width: 1366, height: 680 },
  { promo: 'intro', width: 1366, height: 680 },
]
for (const { promo, width, height } of PROMO_CASES) {
  test.describe(`近くの水域の一覧と画面下の案内 (${promo}, ${width}×${height})`, () => {
    test.use({ viewport: { width, height } })

    test('一覧を開いている間は案内が隠れて一覧が最前面になり、閉じると案内が戻る', async ({ page, context, baseURL }, testInfo) => {
      test.setTimeout(90_000) // 案内は表示まで3〜15秒かかる
      const mock = await prepareWaterMap(page, context, baseURL!, ['success'], { promo, features: 12 })
      // インストール案内は beforeinstallprompt を受けてから15秒後に出る。
      if (promo === 'install') await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')))
      const banner = page.locator('[data-bottom-promo]')
      await expect(banner, '案内が出ていなければ、以降の「隠れた」は何も確かめていない').toBeVisible({ timeout: 30_000 })
      await expect.poll(async () => {
        const box = await banner.boundingBox()
        return box ? box.y + box.height : Number.POSITIVE_INFINITY
      }, { message: '案内が画面内へ滑り込み終えるまで待つ' }).toBeLessThanOrEqual(height)

      await page.getByRole('button', { name: '近くの水域を探す', exact: true }).click()
      await page.getByRole('button', { name: '水域の一覧', exact: true }).click()
      const panel = page.getByRole('region', { name: '近くの水域', exact: true })
      await expect(panel).toBeVisible()
      await expect(banner).toHaveCSS('visibility', 'hidden')
      expect(await pointsCoveredOutsidePanel(panel), '一覧の見えている範囲に、一覧の外の要素が乗っていない').toEqual([])
      await page.screenshot({ path: testInfo.outputPath(`water-list-${promo}-${width}x${height}.png`), fullPage: false })

      await panel.getByRole('button', { name: '一覧を閉じる', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(banner).toHaveCSS('visibility', 'visible')
      await expect(banner).toBeVisible()
      await mock.finish(testInfo)
    })
  })
}
