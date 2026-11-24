import { test, expect, type Page } from '@playwright/test'

const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co').replace(/\/+$/, '')
const AUTH_COOKIE_NAME = `sb-${new URL(SUPABASE_HOST).hostname.split('.')[0]}-auth-token`
const user = {
  id: '00000000-0000-0000-0000-00000000cccc', aud: 'authenticated', role: 'authenticated',
  email: 'map-test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}

function sessionCookieValue() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `base64-${encode({
    access_token: [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', app_metadata: user.app_metadata, exp }), 'signature'].join('.'),
    token_type: 'bearer', expires_in: 60 * 60 * 24 * 365, expires_at: exp,
    refresh_token: 'e2e-fake-refresh-token', user,
  })}`
}

async function prepareMap(page: Page, authenticated = true) {
  await page.addInitScript(([name, value]) => {
    if (value) document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
    localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
    if (!localStorage.getItem('zaridasu_map_layer')) localStorage.setItem('zaridasu_map_layer', 'osm')
  }, [AUTH_COOKIE_NAME, authenticated ? sessionCookieValue() : ''])
  await page.route(`${SUPABASE_HOST}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  if (authenticated) await page.route(`${SUPABASE_HOST}/auth/v1/user**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route(`${SUPABASE_HOST}/rest/v1/user_onboarding**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ region: 'central' }) }))
  await page.route(`${SUPABASE_HOST}/rest/v1/private_spots**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
    id: 'spot-map-regression', user_id: user.id, name: '切替テストの池', note: null,
    lat: 39.72, lng: 140.1, accuracy: null, recorded_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  }]) }))
  // タイル通信をモックし、描画の検証を外部サービスの状態から切り離す。
  await page.route(/https:\/\/(?:[abc]\.tile\.openstreetmap\.org|cyberjapandata\.gsi\.go\.jp)\//, (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG3sAAAAASUVORK5CYII=', 'base64'),
  }))
}

test('地図の帰属リンクが固定ナビに隠れず、スマホからPCまで操作できる', async ({ page, context }) => {
  test.setTimeout(60_000)
  await context.clearCookies()
  await prepareMap(page, false)
  await page.addInitScript(() => localStorage.setItem('zaridasu_onboarding_region_v1', 'central'))
  await page.goto('/map')
  const credit = page.locator('.zari-map-main .leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]')
  await expect(credit).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.loading-screen')).toBeHidden({ timeout: 30_000 })
  for (const width of [390, 768, 1023, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(credit).toBeInViewport({ ratio: 1 })
    await expect.poll(() => credit.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })).toBe(true)
    await credit.click({ trial: true })
  }
})

for (const authenticated of [true, false]) {
test(`地図を繰り返し切り替えても操作ボタン・ピン・スポットが増殖しない（${authenticated ? 'ログイン中' : '未ログイン'}）`, async ({ page, context }, testInfo) => {
  test.setTimeout(60_000)
  await context.clearCookies()
  await prepareMap(page, authenticated)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /same key|Encountered two children|hydration|didn't match|Minified React error/i.test(message.text())) errors.push(message.text())
  })
  await page.goto('/map')
  await expect(page.getByTestId('pin-mode-toggle')).toBeVisible({ timeout: 30_000 })
  if (authenticated) await expect(page.locator('.leaflet-marker-icon[title="切替テストの池"]')).toBeVisible()
  const map = page.locator('.zari-map-main')
  const box = await map.boundingBox()
  if (!box) throw new Error('map not found')
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6, { button: 'right' })
  await expect(page.locator('.leaflet-marker-icon[title="立てたピン"]')).toBeVisible()
  const counts = async () => ({
    save: await page.getByTestId('quick-save-open').count(),
    pin: await page.getByTestId('pin-mode-toggle').count(),
    locate: await page.getByRole('button', { name: '現在地を表示', exact: true }).count(),
    fieldwork: await page.getByTestId('fieldwork-open').count(),
    spot: await page.locator('.leaflet-marker-icon[title="切替テストの池"]').count(),
    droppedPin: await page.locator('.leaflet-marker-icon[title="立てたピン"]').count(),
  })
  const states: { layer: string; counts: Awaited<ReturnType<typeof counts>> }[] = [{ layer: 'initial-osm', counts: await counts() }]
  // ストリーミング中の非表示のヘッダーを除き、操作できるメニューを開く。
  await page.getByRole('button', { name: 'メニューを開く', exact: true }).click()
  const drawer = page.getByRole('dialog')
  for (const layer of ['淡色地図', '詳細地図', '航空写真', '標準地図', '航空写真', '淡色地図', '詳細地図', '標準地図']) {
    await drawer.getByRole('button', { name: layer, exact: true }).click()
    await expect(drawer.getByRole('button', { name: layer, exact: true })).toHaveAttribute('aria-pressed', 'true')
    const state = { layer, counts: await counts() }
    states.push(state)
    expect.soft(state.counts, `切替: ${layer}`).toEqual({ save: 1, pin: 1, locate: 1, fieldwork: 1, spot: authenticated ? 1 : 0, droppedPin: 1 })
  }
  await testInfo.attach('layer-switch-counts', { body: JSON.stringify({ states, errors }, null, 2), contentType: 'application/json' })
  await drawer.getByRole('button', { name: 'メニューを閉じる', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.getByTestId('header-menu').filter({ visible: true })).toBeFocused()
  await page.getByTestId('header-menu').filter({ visible: true }).click()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(page.getByTestId('header-menu').filter({ visible: true })).toBeFocused()
  expect(errors).toEqual([])
})
}

test('航空写真をデフォルトに保存すると、一時的に詳細地図を開いても再読込で航空写真に戻る', async ({ page, context }, testInfo) => {
  test.setTimeout(60_000)
  await context.clearCookies()
  await prepareMap(page)
  await page.goto('/map')
  await expect(page.getByTestId('pin-mode-toggle')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'メニューを開く', exact: true }).click()
  let drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: '航空写真', exact: true }).click()
  await drawer.getByRole('button', { name: 'この地図をデフォルトにする', exact: true }).click()
  await expect(drawer.getByRole('button', { name: 'この地図がデフォルトです', exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: '詳細地図', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '詳細地図', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('zaridasu_map_layer'))).toBe('photo')
  await page.reload()
  await expect(page.getByTestId('pin-mode-toggle')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.zari-map-main .leaflet-tile-pane img').first()).toHaveAttribute('src', /\/seamlessphoto\//)
  await page.getByRole('button', { name: 'メニューを開く', exact: true }).click()
  drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('button', { name: '航空写真', exact: true })).toHaveAttribute('aria-pressed', 'true')
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`map-default-photo-${width}.png`) })
    await testInfo.attach(`map-default-photo-${width}`, { body: screenshot, contentType: 'image/png' })
  }
})

test('位置情報を非公開にした投稿が混ざっても地図と表示範囲フィルターを操作できる', async ({ page, context }) => {
  await context.clearCookies()
  await prepareMap(page, false)
  const base = {
    species: 'american', info_type: 'capture', municipality: '秋田市',
    comment: '', photos: [], is_anonymous: true, is_official: false,
    created_at: '2026-01-01T00:00:00Z', count: 1,
  }
  await page.route(`${SUPABASE_HOST}/rest/v1/posts**`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([
      { ...base, id: 'public-position', lat: 39.72, lng: 140.1 },
      { ...base, id: 'hidden-position', lat: null, lng: null },
      { ...base, id: 'missing-latitude', lat: null, lng: 140.1 },
      { ...base, id: 'missing-longitude', lat: 39.72, lng: null },
    ]),
  }))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /ErrorBoundary|reading 'lat'|Invalid LatLng/i.test(message.text())) errors.push(message.text())
  })
  await page.goto('/map')
  const map = page.locator('.zari-map-main')
  await expect(map).toBeVisible({ timeout: 30_000 })
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(1)
  const filter = page.getByRole('button', { name: '現在の地図範囲内のみ', exact: true })
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(1)
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'false')
  await expect(map).toBeVisible()
  expect(errors).toEqual([])
})
