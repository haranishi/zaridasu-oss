import { test, expect, type Page } from '@playwright/test'

// REQ-329: 地図のピン→経路（Google / Yahoo! / Apple）、非公開のクイック保存、投稿フォームの「位置の公開」、
// 管理画面の非公開スポット一覧。
//
// Supabase は page.route で全部モックする（admin-gemini-banner.spec.ts と同じ作法）。
// ログイン状態は @supabase/ssr が読む cookie（sb-<ref>-auth-token）を addInitScript で直接置いて作る。

const SUPABASE_HOST = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
).replace(/\/+$/, '')
const SUPABASE_REF = new URL(SUPABASE_HOST).hostname.split('.')[0]
const AUTH_COOKIE_NAME = `sb-${SUPABASE_REF}-auth-token`

function makeUser(id: string, admin: boolean) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: admin ? 'admin@example.com' : 'user@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: admin ? { role: 'admin', provider: 'email' } : { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
}

function sessionCookieValue(user: ReturnType<typeof makeUser>) {
  const expSec = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const accessToken = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: user.id, aud: 'authenticated', role: 'authenticated', app_metadata: user.app_metadata, exp: expSec }),
    'signature',
  ].join('.')
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expSec,
    refresh_token: 'e2e-fake-refresh-token',
    user,
  }
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

/** 未ログインでも紹介ポップアップ・バナーが操作を遮らないようにする。 */
async function quietInit(page: Page, cookie?: string) {
  await page.addInitScript(
    ([name, value]) => {
      try {
        if (value) document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`
        window.localStorage.setItem('zaridasu_lang', 'ja')
        window.localStorage.setItem('zaridasu_intro_optout_v1', '1')
        window.localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
        window.localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
      } catch { /* noop */ }
    },
    [AUTH_COOKIE_NAME, cookie ?? ''] as const,
  )
}

interface SpotRow {
  id: string
  user_id?: string
  name: string
  note: string | null
  lat: number
  lng: number
  accuracy: number | null
  recorded_at: string
  created_at: string
}

/** Supabase のモック。後に登録した route が優先されるので、キャッチオールを最初に置く。 */
async function mockSupabase(page: Page, opts: { user?: ReturnType<typeof makeUser>; spots?: SpotRow[] } = {}) {
  const spots = [...(opts.spots ?? [])]
  await page.route(`${SUPABASE_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  if (opts.user) {
    const user = opts.user
    await page.route(`${SUPABASE_HOST}/auth/v1/user**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
    )
    // 必須オンボーディング（REQ-325）を済ませた扱いにする
    await page.route(`${SUPABASE_HOST}/rest/v1/user_onboarding**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ region: 'central' }),
      }),
    )
  }
  await page.route(`${SUPABASE_HOST}/rest/v1/private_spots**`, async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>
      const row: SpotRow = {
        id: `spot-${spots.length + 1}`,
        name: String(body.name),
        note: (body.note as string | null) ?? null,
        lat: Number(body.lat),
        lng: Number(body.lng),
        accuracy: (body.accuracy as number | null) ?? null,
        recorded_at: String(body.recorded_at),
        created_at: new Date().toISOString(),
      }
      spots.unshift(row)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(spots) })
  })
  return spots
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('地図でピンを立てると、そこへの経路を 3 社の地図で開ける（未ログイン）', async ({ page }) => {
  await quietInit(page)
  await mockSupabase(page)
  await page.goto('/map')

  const toggle = page.getByTestId('pin-mode-toggle')
  await expect(toggle).toBeVisible({ timeout: 30_000 })
  await toggle.click()
  await expect(page.getByText('地図をタップしてピンを立てる（長押しでもOK）')).toBeVisible()

  const map = page.locator('.zari-map-main')
  const box = await map.boundingBox()
  if (!box) throw new Error('map not found')
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45)

  const popup = page.locator('.leaflet-popup-content')
  await expect(popup.getByText('立てたピン')).toBeVisible()
  const links = popup.getByTestId('route-links').getByRole('link')
  await expect(links).toHaveCount(3)
  await expect(popup.getByRole('link', { name: /Googleマップで経路を調べる/ }))
    .toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
  await expect(popup.getByRole('link', { name: /Yahoo!マップで経路を調べる/ }))
    .toHaveAttribute('href', /^https:\/\/map\.yahoo\.co\.jp\/route\/car\?to=/)
  await expect(popup.getByRole('link', { name: /Appleマップで経路を調べる/ }))
    .toHaveAttribute('href', /^https:\/\/maps\.apple\.com\/directions\?destination=/)
  await page.waitForTimeout(800) // autoPan のアニメーションが終わってから撮る（見た目の確認用）
  await page.screenshot({ path: 'test-results/req329-pin-routes.png' })
})

test('ログイン中は「非公開で保存」で名前を付けて保存でき、地図に錠前のスポットが出る', async ({ page, context }) => {
  const user = makeUser('00000000-0000-0000-0000-00000000aaaa', false)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 39.72, longitude: 140.1 })
  await quietInit(page, sessionCookieValue(user))
  await mockSupabase(page, { user })
  await page.goto('/map')

  await page.getByTestId('quick-save-open').click()
  const sheet = page.getByTestId('quick-save-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('現在地を保存します')).toBeVisible()
  await expect(sheet.getByText(/あなたと運営（管理者）だけが見られます/)).toBeVisible()
  await page.getByTestId('quick-save-name').fill('テストの池のメダカ')
  await page.screenshot({ path: 'test-results/req329-quick-save-sheet.png' })

  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/private_spots') && r.method() === 'POST'),
    page.getByTestId('quick-save-submit').click(),
  ])
  const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
  expect(body).toMatchObject({ user_id: user.id, name: 'テストの池のメダカ', lat: 39.72, lng: 140.1 })

  await expect(sheet).toHaveCount(0)
  const marker = page.locator('.leaflet-marker-icon[title="テストの池のメダカ"]')
  await expect(marker).toBeVisible()
  await marker.click()
  const popup = page.locator('.leaflet-popup-content')
  await expect(popup.getByText('非公開（あなたと運営だけ）')).toBeVisible()
  await expect(popup.getByTestId('route-links').getByRole('link')).toHaveCount(3)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/req329-private-spot-popup.png' })
})

test('ピンの「ここで投稿」から、位置の公開／非公開を選べる投稿フォームが開く', async ({ page }) => {
  const user = makeUser('00000000-0000-0000-0000-00000000bbbb', false)
  await quietInit(page, sessionCookieValue(user))
  await mockSupabase(page, { user })
  await page.goto('/map')

  const map = page.locator('.zari-map-main')
  await expect(page.getByTestId('pin-mode-toggle')).toBeVisible({ timeout: 30_000 })
  const box = await map.boundingBox()
  if (!box) throw new Error('map not found')
  // 右クリック（スマホでは長押し）でもピンを立てられる
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' })
  const popup = page.locator('.leaflet-popup-content')
  await popup.getByRole('button', { name: /ここで投稿/ }).click()

  const dialog = page.getByRole('dialog', { name: '情報を投稿する' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('位置の公開')).toBeVisible()
  await page.getByTestId('postform-disclosure-private').click()
  await expect(page.getByTestId('postform-disclosure-private')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText(/あなたと運営だけが見られます/)).toBeVisible()
  await page.screenshot({ path: 'test-results/req329-post-form-private.png' })
})

// 管理画面（/admin/spots）はサーバー側の認可ゲート（getUser）がブラウザの route モックでは通らないため、
// E2E ではなく単体テスト（src/views/admin/__tests__/AdminSpotsPage.test.tsx）で確認する。
