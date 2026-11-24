import { test, expect, type BrowserContext, type Page, type Route, type TestInfo } from '@playwright/test'
import { seedAdminSession } from './fixtures/admin-api'
import { knownTestUser, TEST_ADMIN, TEST_MEMBER, TEST_SUPABASE_ORIGIN } from './fixtures/admin-auth.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }
const PLAN_ID = '00000000-0000-4000-8000-000000000201'
const REPORT_ID = '00000000-0000-4000-8000-000000000301'
const WATER_ID = '00000000-0000-4000-8000-000000000401'
interface Call { method: string; path: string; query: string; body?: Record<string, unknown> | Record<string, unknown>[] }
interface Upload { path: string; jpeg: Buffer; mime: string }
interface Position { lat: number; lng: number }
interface Box { x: number; y: number; width: number; height: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function intersectionArea(a: Box, b: Box) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
}

test.use({ serviceWorkers: 'block' })

/** Real browser and local Next. Only named, validated synthetic mutations are fulfilled. */
async function prepare(page: Page, context: BrowserContext, baseURL: string, admin = false) {
  const local = new URL(baseURL).origin
  expect(new URL(baseURL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/)
  expect((process.env.NEXT_PUBLIC_SUPABASE_URL ?? TEST_SUPABASE_ORIGIN).replace(/\/+$/, '')).toBe(TEST_SUPABASE_ORIGIN)
  await seedAdminSession(context, baseURL, admin)
  await context.addInitScript(() => {
    localStorage.setItem('zaridasu_onboarding_region_v1', 'central')
    localStorage.setItem('zaridasu_map_layer', 'osm')
  })
  const user = admin ? TEST_ADMIN : TEST_MEMBER
  const calls: Call[] = [], unexpected: string[] = [], blockedWrites: string[] = [], pageErrors: string[] = [], consoleErrors: string[] = []
  const uploads: Upload[] = []
  let center: Position | null = null
  let community: { id: string; name: string; lat: number; lng: number; created_at: string } | null = null
  let publicPoint: { display_lat: number; display_lng: number } | null = null
  let report: Record<string, unknown> | null = admin ? {
    id: REPORT_ID, user_id: TEST_MEMBER.id, client_id: '00000000-0000-4000-8000-000000000302', name: 'E2E 未掲載の池', note: 'E2E 写真付き情報', lat: 39.720123, lng: 140.110987,
    photo_paths: [`${TEST_MEMBER.id}/00000000-0000-4000-8000-000000000303.jpg`], status: 'pending', public_name: null, published_water_body_id: null, reviewed_at: null, reviewed_by: null, created_at: '2026-10-08T00:00:00Z',
  } : null
  const stops: Record<string, unknown>[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /ErrorBoundary|hydration|didn't match|Minified React error|Invalid LatLng/i.test(message.text())) consoleErrors.push(message.text())
  })
  async function json(route: Route, data: unknown, status = 200, count?: number) {
    return route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, ...(count === undefined ? {} : { 'Content-Range': count === 0 ? '*/0' : `0-${count - 1}/${count}` }) }, body: route.request().method() === 'HEAD' ? '' : JSON.stringify(data) })
  }
  async function reject(route: Route) {
    const request = route.request(), url = new URL(request.url())
    const description = `${request.method()} ${url.hostname}${url.pathname}`
    unexpected.push(description)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) blockedWrites.push(description)
    await route.abort('blockedbyclient')
  }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    if (url.origin === local) {
      if (!['GET', 'HEAD'].includes(method)) return reject(route)
      if (url.pathname === '/api/nearby-water') {
        const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'))
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || url.searchParams.get('radius') !== '1500') return reject(route)
        center = { lat, lng }
        const square = (x: number, y: number) => [[x - 0.0004, y - 0.0004], [x + 0.0004, y - 0.0004], [x + 0.0004, y + 0.0004], [x - 0.0004, y + 0.0004], [x - 0.0004, y - 0.0004]]
        publicPoint = { display_lat: lat, display_lng: lng + 0.001 }
        community = { id: WATER_ID, name: 'E2E 地域の池', lat: Math.round((lat + 0.002) * 1000) / 1000, lng: Math.round((lng + 0.004) * 1000) / 1000, created_at: '2026-10-08T00:00:00Z' }
        return json(route, { type: 'FeatureCollection', features: [
          { type: 'Feature', id: 'way/far', properties: { name: 'E2E 遠い池' }, geometry: { type: 'Polygon', coordinates: [square(lng + 0.007, lat + 0.005)] } },
          { type: 'Feature', id: 'way/near', properties: { name: 'E2E 近い池' }, geometry: { type: 'Polygon', coordinates: [square(lng + 0.001, lat)] } },
        ], meta: { degraded: false } })
      }
      if (url.pathname.startsWith('/api/')) return reject(route)
      return route.continue()
    }
    if (method === 'GET' && (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname) || url.hostname === 'cyberjapandata.gsi.go.jp')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    if (url.origin !== TEST_SUPABASE_ORIGIN) return reject(route)
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS' } })
    const authenticated = knownTestUser(request.headers().authorization?.replace(/^Bearer /, ''))
    if (method === 'GET' && url.pathname === '/auth/v1/user') return json(route, authenticated ?? { message: 'Unknown synthetic session' }, authenticated ? 200 : 401)

    if (method === 'POST' && url.pathname.startsWith('/storage/v1/object/water-report-photos/')) {
      if (authenticated?.id !== TEST_MEMBER.id) return reject(route)
      const path = url.pathname.slice('/storage/v1/object/water-report-photos/'.length)
      const [owner, filename] = path.split('/')
      if (owner !== TEST_MEMBER.id || !filename?.endsWith('.jpg') || !uuid.test(filename.slice(0, -4)) || request.headers()['x-upsert'] !== 'false') return reject(route)
      const body = request.postDataBuffer()
      if (!body) return reject(route)
      const start = body.indexOf(Buffer.from([0xff, 0xd8, 0xff])), end = body.lastIndexOf(Buffer.from([0xff, 0xd9]))
      if (start < 0 || end < start || !body.subarray(0, start).toString().includes('Content-Type: image/jpeg')) return reject(route)
      uploads.push({ path, jpeg: body.subarray(start, end + 2), mime: 'image/jpeg' })
      return json(route, { Key: `water-report-photos/${path}`, Id: 'synthetic-upload' })
    }
    let body: Call['body']
    if (method === 'POST') {
      try { body = request.postDataJSON() as Call['body'] } catch { return reject(route) }
    }
    calls.push({ method, path: url.pathname, query: url.search, body })
    const object = body && !Array.isArray(body) ? body : undefined
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_dashboard_stats') return json(route, { total_posts: 0, this_month_posts: 0, last_month_posts: 0, species_counts: [], info_type_counts: [], monthly_data: [], municipality_counts: [] })
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_undersurveyed_areas') return json(route, [])
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_user_profile' && object?.p_user_id === user.id) return json(route, null)
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/review_water_report') {
      if (authenticated?.id !== TEST_ADMIN.id || !report || object?.p_id !== REPORT_ID || !['accepted', 'rejected'].includes(String(object.p_status))) return reject(route)
      const accepted = object.p_status === 'accepted'
      if (accepted && (typeof object.p_public_name !== 'string' || object.p_public_name.trim() === '')) return reject(route)
      report = { ...report, status: object.p_status, public_name: accepted ? object.p_public_name : report.public_name, published_water_body_id: accepted ? WATER_ID : null, reviewed_at: '2026-10-08T01:00:00Z', reviewed_by: TEST_ADMIN.id }
      return json(route, true)
    }
    if (method === 'POST' && url.pathname === '/storage/v1/object/sign/water-report-photos') {
      if (authenticated?.id !== TEST_ADMIN.id || !report || JSON.stringify(object?.paths) !== JSON.stringify(report.photo_paths)) return reject(route)
      return json(route, (object!.paths as string[]).map(path => ({ path, signedURL: `/object/sign/water-report-photos/${path}?token=synthetic-only` })))
    }
    if (method === 'GET' && admin && url.pathname === `/storage/v1/object/sign/water-report-photos/${TEST_MEMBER.id}/00000000-0000-4000-8000-000000000303.jpg`) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    if (method === 'POST' && url.pathname === '/rest/v1/survey_plan_stops') {
      if (authenticated?.id !== TEST_MEMBER.id || !Array.isArray(body) || body.length !== 1) return reject(route)
      const row = body[0]!
      if (row.user_id !== TEST_MEMBER.id || row.plan_id !== PLAN_ID || row.source !== 'pin' || row.source_id !== null || row.name !== community?.name || row.lat !== community?.lat || row.lng !== community?.lng) return reject(route)
      const inserted = { ...row, id: '00000000-0000-4000-8000-000000000202', status: 'pending', visited_at: null, created_at: '2026-10-08T01:00:00Z' }
      stops.push(inserted)
      return json(route, [inserted])
    }
    if (method === 'POST' && url.pathname === '/rest/v1/water_reports') {
      if (authenticated?.id !== TEST_MEMBER.id || !object || object.user_id !== TEST_MEMBER.id || !uuid.test(String(object.client_id)) || typeof object.name !== 'string' || !Number.isFinite(object.lat) || !Number.isFinite(object.lng)
        || !Array.isArray(object.photo_paths) || JSON.stringify(object.photo_paths) !== JSON.stringify(uploads.map(upload => upload.path))) return reject(route)
      if (report) return json(route, { code: '23505', message: 'Synthetic duplicate UUID' }, 409)
      report = { ...object, id: REPORT_ID, status: 'pending', public_name: null, published_water_body_id: null, reviewed_at: null, reviewed_by: null, created_at: '2026-10-08T00:00:00Z' }
      // Commit succeeded but its response was lost; retry must reuse UUID and uploaded path.
      return json(route, { code: '08006', message: 'Synthetic lost insert response' }, 503)
    }
    if (!['GET', 'HEAD'].includes(method)) return reject(route)
    if (method === 'HEAD' && url.pathname === '/rest/v1/ai_call_logs') return json(route, [], 200, 0)
    if (url.pathname === '/rest/v1/user_onboarding') return json(route, { user_id: user.id, region: 'central', completed_at: '2026-10-08T00:00:00Z' })
    if (url.pathname === '/rest/v1/posts') {
      if (method === 'GET' && url.searchParams.get('select')?.replace(/\s/g, '') === 'display_lat,display_lng') {
        if (url.searchParams.get('status') !== 'eq.approved' || !url.searchParams.has('display_lat') || !url.searchParams.has('display_lng')) return reject(route)
        return json(route, publicPoint ? [publicPoint] : [], 200, publicPoint ? 1 : 0)
      }
      return json(route, [], 200, 0)
    }
    if (url.pathname === '/rest/v1/community_water_bodies') return json(route, community ? [community] : [])
    if (url.pathname === '/rest/v1/survey_plans' && url.searchParams.get('user_id') === `eq.${TEST_MEMBER.id}`) {
      // Match this page's local calendar even when the runner uses another timezone.
      const plannedOn = await page.evaluate(() => {
        const today = new Date()
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      })
      return json(route, [{ id: PLAN_ID, title: 'E2E 今日の計画', planned_on: plannedOn, status: 'active', note: null, created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z' }])
    }
    if (url.pathname === '/rest/v1/survey_plan_stops' && url.searchParams.get('plan_id') === `eq.${PLAN_ID}`) return json(route, stops)
    if (['/rest/v1/survey_requests', '/rest/v1/private_spots', '/rest/v1/rare_sightings', '/rest/v1/survey_stop_posts', '/rest/v1/user_profiles'].includes(url.pathname)) return json(route, [])
    if (url.pathname === '/rest/v1/water_reports') {
      if (admin) return json(route, report ? [report] : [])
      if (url.searchParams.get('user_id') !== `eq.${TEST_MEMBER.id}` || url.searchParams.get('client_id') !== `eq.${report?.client_id}`) return reject(route)
      return json(route, report)
    }
    return reject(route)
  })
  return {
    calls, uploads, getCommunity: () => community, getCenter: () => center,
    async finish(info: TestInfo) {
      await info.attach('water-discovery-fixtures', { body: JSON.stringify({ calls, uploads: uploads.map(({ path, jpeg, mime }) => ({ path, bytes: jpeg.length, mime })), unexpected, blockedWrites, pageErrors, consoleErrors, actualDbWrites: 0, actualStorageWrites: 0, actualAuthWrites: 0 }, null, 2), contentType: 'application/json' })
      expect(unexpected, 'No unnamed endpoint or live external fallback').toEqual([])
      expect(blockedWrites, 'Only explicitly validated synthetic writes').toEqual([])
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
    },
  }
}

async function home(page: Page) {
  await page.goto('/map')
  await expect(page.locator('.loading-screen')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '近くの水域を探す', exact: true })).toBeVisible({ timeout: 30_000 })
}

for (const width of [390, 768, 1440]) {
  test.describe(`water discovery ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } })
    test('distance list, control hit areas, wheel isolation and retained location reach the existing plan', async ({ page, context, baseURL }, info) => {
      const api = await prepare(page, context, baseURL!)
      await home(page)
      await page.getByRole('button', { name: '近くの水域を探す', exact: true }).click()
      await expect(page.getByRole('button', { name: '非表示 · 3 件', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '水域の一覧', exact: true }).click()
      const panel = page.getByRole('region', { name: '近くの水域', exact: true })
      const actionStack = page.locator('.leaflet-container > .leaflet-bottom.leaflet-right')
      await expect(actionStack).toHaveCSS('visibility', width === 390 ? 'hidden' : 'visible')
      await expect(page.locator('.leaflet-control-attribution')).toBeVisible()
      await expect(panel.getByText('周辺の公開記録 1件', { exact: true })).toBeVisible()
      const pointerEvents = await panel.evaluate(section => {
        const control = section.closest('.leaflet-control')
        const buttonRow = control?.firstElementChild
        const status = control?.querySelector('[role="status"]')
        if (!control || !buttonRow || !status) throw new Error('Water controls are incomplete')
        return {
          control: getComputedStyle(control).pointerEvents,
          buttonRow: getComputedStyle(buttonRow).pointerEvents,
          status: getComputedStyle(status).pointerEvents,
          panel: getComputedStyle(section).pointerEvents,
        }
      })
      expect(pointerEvents).toEqual({ control: 'none', buttonRow: 'auto', status: 'auto', panel: 'auto' })
      if (width === 1440) {
        const panelWheelPrevented = await panel.locator('.overflow-y-auto').evaluate(scrollArea => {
          const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
          scrollArea.dispatchEvent(event)
          return event.defaultPrevented
        })
        const mapWheelPrevented = await page.locator('.zari-map-main').evaluate(map => {
          const rect = map.getBoundingClientRect()
          const target = document.elementFromPoint(rect.right - 80, rect.top + rect.height * 0.6)
          if (!(target instanceof HTMLElement) || !map.contains(target)) throw new Error('No unobstructed map target')
          const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
          target.dispatchEvent(event)
          return event.defaultPrevented
        })
        expect(panelWheelPrevented).toBe(false)
        expect(mapWheelPrevented).toBe(true)
      }
      const panelBox = await panel.boundingBox()
      const reportButtonBox = await page.getByRole('button', { name: '地図にない水域を知らせる', exact: true }).first().boundingBox()
      const statusBox = await page.getByRole('status').filter({ hasText: '地図の中心から半径1.5kmを検索' }).boundingBox()
      const switchBox = await page.getByTestId('home-panel-switch').boundingBox()
      expect(panelBox).not.toBeNull()
      expect(reportButtonBox).not.toBeNull()
      expect(statusBox).not.toBeNull()
      expect(switchBox).not.toBeNull()
      expect(intersectionArea(panelBox!, reportButtonBox!)).toBe(0)
      expect(intersectionArea(panelBox!, statusBox!)).toBe(0)
      expect(intersectionArea(panelBox!, switchBox!)).toBe(0)
      await panel.getByRole('button', { name: '一覧を閉じる', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(actionStack).toHaveCSS('visibility', 'visible')
      await page.getByRole('button', { name: '水域の一覧', exact: true }).click()
      await expect(panel).toBeVisible()
      const names = panel.locator('li button[aria-pressed] span:first-child')
      await expect(names).toHaveText(['E2E 近い池', 'E2E 地域の池', 'E2E 遠い池'])
      await panel.getByRole('checkbox', { name: '公開記録のない候補だけ', exact: true }).check()
      await expect(names).toHaveText(['E2E 地域の池', 'E2E 遠い池'])
      await panel.getByRole('button', { name: '公開記録のない候補を選ぶ', exact: true }).click()
      const row = panel.getByRole('listitem').filter({ hasText: 'E2E 地域の池' })
      await expect(row.getByRole('button', { name: /E2E 地域の池.*地図中心/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(row.getByText('地点は岸付近の目安です。立ち入りできる場所を確認して調査してください。')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`water-candidates-${width}.png`), fullPage: false })
      const box = await page.locator('.zari-map-main').boundingBox()
      expect(box).not.toBeNull()
      await page.mouse.move(box!.x + box!.width * 0.95, box!.y + box!.height * 0.6)
      await page.mouse.down()
      await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.65, { steps: 10 })
      await page.mouse.up()
      await row.getByRole('button', { name: 'E2E 地域の池: 計画に入れる', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(page.getByTestId('fieldwork-panel')).toBeVisible()
      await expect.poll(() => api.calls.filter(call => call.method === 'POST' && call.path === '/rest/v1/survey_plan_stops').length).toBe(1)
      const body = api.calls.find(call => call.method === 'POST' && call.path === '/rest/v1/survey_plan_stops')!.body as Record<string, unknown>[]
      const selected = api.getCommunity()!
      expect(body[0]).toMatchObject({ plan_id: PLAN_ID, name: selected.name, lat: selected.lat, lng: selected.lng, source: 'pin' })
      await expect(page.getByTestId('fieldwork-panel').getByText('E2E 地域の池', { exact: true }).first()).toBeVisible()
      await page.screenshot({ path: info.outputPath(`water-plan-${width}.png`), fullPage: false })
      await api.finish(info)
    })
  })
}

test.describe('water discovery short viewport', () => {
  test.use({ viewport: { width: 390, height: 667 } })
  test('keeps the candidate panel above the bottom navigation with its heading visible', async ({ page, context, baseURL }, info) => {
    const api = await prepare(page, context, baseURL!)
    await home(page)
    await page.getByRole('button', { name: '近くの水域を探す', exact: true }).click()
    await expect(page.getByRole('button', { name: '非表示 · 3 件', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '水域の一覧', exact: true }).click()
    const panel = page.getByRole('region', { name: '近くの水域', exact: true })
    await expect(page.locator('.leaflet-container > .leaflet-bottom.leaflet-right')).toHaveCSS('visibility', 'hidden')
    await expect(page.locator('.leaflet-control-attribution')).toBeVisible()
    const bottomNav = page.locator('nav').filter({ has: page.getByRole('button', { name: '投稿する', exact: true }) })
    await expect(panel.getByRole('heading', { name: '近くの水域', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: '一覧を閉じる', exact: true })).toBeVisible()
    await expect(bottomNav).toBeVisible()
    const panelBox = await panel.boundingBox()
    const navBox = await bottomNav.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(navBox!.y)
    await api.finish(info)
  })
})

test('photo reporting keeps picked coordinates, uploads a reduced JPEG and retries the same UUID after lost response', async ({ page, context, baseURL }, info) => {
  const api = await prepare(page, context, baseURL!)
  await home(page)
  const selected = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1920; canvas.height = 1440
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(canvas.width, canvas.height)
    let seed = 1
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      image.data[i] = seed & 255; image.data[i + 1] = (seed >>> 8) & 255; image.data[i + 2] = (seed >>> 16) & 255; image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const original = Buffer.from(selected, 'base64')
  await page.getByRole('button', { name: '地図にない水域を知らせる', exact: true }).click()
  const map = page.locator('.zari-map-main')
  await map.click({ position: { x: 260, y: 120 } })
  const sheet = page.getByTestId('water-report-sheet')
  await expect(sheet).toBeVisible()
  const positionText = await sheet.getByText(/選んだ位置/).innerText()
  const coordinates = positionText.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)!
  expect(coordinates).not.toBeNull()
  await sheet.getByLabel('水域の名前 *', { exact: true }).fill('E2E 写真の池')
  await sheet.getByLabel('補足（任意）', { exact: true }).fill('E2E 写真情報')
  await sheet.getByTestId('water-report-photos').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: original })
  const preview = sheet.getByRole('img', { name: '水域の写真 1', exact: true })
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1280)
  expect(await preview.evaluate(image => (image as HTMLImageElement).naturalHeight)).toBe(960)
  await sheet.getByTestId('water-report-submit').click()
  await expect(sheet.getByRole('alert')).toHaveText('送信できませんでした。入力は残っています。同じ情報で再試行してください。')
  await expect(sheet.getByLabel('水域の名前 *', { exact: true })).toHaveValue('E2E 写真の池')
  expect(api.uploads).toHaveLength(1)
  expect(api.uploads[0]!.jpeg.length).toBeLessThan(original.length)
  expect(api.uploads[0]!.jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  expect(api.uploads[0]!.jpeg.includes(Buffer.from('Exif\0\0'))).toBe(false)
  const dimensions = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
    return { width: bitmap.width, height: bitmap.height }
  }, api.uploads[0]!.jpeg.toString('base64'))
  expect(dimensions).toEqual({ width: 1280, height: 960 })
  await sheet.getByTestId('water-report-submit').click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('この位置で情報提供', { exact: true })).toHaveCount(0)
  const inserts = api.calls.filter(call => call.method === 'POST' && call.path === '/rest/v1/water_reports')
  expect(inserts).toHaveLength(2)
  expect(inserts[0]!.body).toEqual(inserts[1]!.body)
  const row = inserts[0]!.body as Record<string, unknown>
  expect(Number(row.lat)).toBeCloseTo(Number(coordinates[1]), 5)
  expect(Number(row.lng)).toBeCloseTo(Number(coordinates[2]), 5)
  expect(api.uploads).toHaveLength(1)
  await api.finish(info)
})

test('synthetic admin reviews a private photo report and can unpublish its public projection', async ({ page, context, baseURL }, info) => {
  const api = await prepare(page, context, baseURL!, true)
  await page.goto('/admin/water-reports')
  await expect(page.getByRole('heading', { name: '水域の情報提供を確認', exact: true })).toBeVisible()
  const list = page.getByTestId('water-reports-list')
  await expect(list.getByRole('heading', { name: 'E2E 未掲載の池', exact: true })).toBeVisible()
  await expect(list.getByRole('img', { name: '水域の写真 1', exact: true })).toBeVisible()
  await page.getByLabel('公開する水域の名前', { exact: true }).fill('E2E 確認済みの池')
  await page.getByRole('button', { name: '採用して公開', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '水域を採用し、名前とおおよその位置を公開しました。' })).toBeVisible()
  await page.getByRole('combobox').selectOption('accepted')
  await expect(list.getByText('採用済み', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '公開を取り消す', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '公開を取り消し、水域一覧から外しました。' })).toBeVisible()
  const reviews = api.calls.filter(call => call.path === '/rest/v1/rpc/review_water_report')
  expect(reviews.map(call => call.body)).toEqual([
    { p_id: REPORT_ID, p_status: 'accepted', p_public_name: 'E2E 確認済みの池' },
    { p_id: REPORT_ID, p_status: 'rejected', p_public_name: null },
  ])
  await api.finish(info)
})
