import { test, expect, type Page } from '@playwright/test'

// API はすべてブラウザ内で応答し、実 DB や Storage には投稿しない。
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co').replace(/\/+$/, '')
const USER_ID = '55555555-5555-5555-5555-555555555555'
const SUCCESS_KEY = `zarigani_submit_timestamps:success:v1:${USER_ID}`
const POSITION = { lat: 39.720123456, lng: 140.140987654 }

async function setupSignedIn(page: Page) {
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'post-test@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
  const expires = Math.floor(Date.now() / 1000) + 86400
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const session = {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', app_metadata: user.app_metadata, exp: expires })}.signature`,
    refresh_token: 'fake-post-test-refresh',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: expires,
    user,
  }
  const cookieName = `sb-${new URL(SUPABASE_HOST).hostname.split('.')[0]}-auth-token`
  await page.addInitScript(({ name, value, position }) => {
    document.cookie = `${name}=${value}; path=/; max-age=86400; SameSite=Lax`
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
    localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: { latitude: position.lat, longitude: position.lng, accuracy: 8 },
          timestamp: Date.now(),
        } as GeolocationPosition),
      },
    })
  }, { name: cookieName, value: `base64-${encode(session)}`, position: POSITION })

  // 不要な外部通信も遮断。個別モックは後に登録して優先させる。
  await page.route('https://**/*', (route) => route.abort())
  await page.route(`${SUPABASE_HOST}/**`, (route) => route.fulfill({ json: [] }))
  await page.route(`${SUPABASE_HOST}/auth/v1/user**`, (route) => route.fulfill({ json: user }))
  await page.route(`${SUPABASE_HOST}/rest/v1/user_onboarding**`, (route) => route.fulfill({ json: { region: 'central' } }))
  await page.route(`${SUPABASE_HOST}/rest/v1/rpc/get_my_experiment_variants**`, (route) => route.fulfill({ json: {} }))
  await page.route('https://nominatim.openstreetmap.org/reverse**', (route) => route.fulfill({ json: { address: { city: '秋田市', province: '秋田県' } } }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: { current: { weather_code: 0, temperature_2m: 20, relative_humidity_2m: 60 } } }))
}

async function openForm(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '投稿する', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '情報を投稿する' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('緯度', { exact: true })).toHaveValue(String(POSITION.lat))
  await expect(dialog.getByLabel('経度', { exact: true })).toHaveValue(String(POSITION.lng))
  return dialog
}

test('小数桁の多い GPS 座標と写真を送信し、受付完了まで進む', async ({ page }) => {
  await setupSignedIn(page)
  const submitted: Record<string, unknown>[] = []
  let uploaded = 0
  await page.route(`${SUPABASE_HOST}/storage/v1/object/post-photos/**`, async (route) => {
    expect(route.request().method()).toBe('POST')
    uploaded++
    await route.fulfill({ status: 200, json: { Key: 'post-photos/test.jpg' } })
  })
  await page.route(`${SUPABASE_HOST}/rest/v1/posts**`, async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    submitted.push(route.request().postDataJSON())
    await route.fulfill({ status: 201, json: { id: 'posted-1' } })
  })
  const dialog = await openForm(page)
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const context = canvas.getContext('2d')!
    context.fillStyle = '#c33333'
    context.fillRect(0, 0, 32, 32)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  await dialog.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(dialog.getByRole('img', { name: 'プレビュー1' })).toBeVisible()
  await dialog.getByRole('button', { name: '🦞 投稿する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('投稿を受け付けました。管理者が確認後に公開されます。')).toBeVisible()
  expect(uploaded).toBe(1)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toMatchObject({ user_id: USER_ID, lat: POSITION.lat, lng: POSITION.lng, accuracy: 8, location_source: 'gps' })
  expect(submitted[0]!.photos).toHaveLength(1)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SUCCESS_KEY)).toHaveLength(1)
})

test('5MB超の原本を自動縮小し、同じ写真を選び直して投稿できる', async ({ page }) => {
  await setupSignedIn(page)
  // 実際のWorkerによる変換を行う。送信だけ一時保留して、準備中の操作を確実に確認する。
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const waiting: (() => void)[] = []
    let paused = true
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown, options: Transferable[] | StructuredSerializeOptions = []) {
        const send = () => Array.isArray(options)
          ? super.postMessage(message, options)
          : super.postMessage(message, options)
        if (paused && message && typeof message === 'object' && 'mimeType' in message) waiting.push(send)
        else send()
      }
    }
    Object.assign(window, {
      holdPhotoProcessing: () => { paused = true },
      releasePhotoProcessing: () => {
        paused = false
        waiting.splice(0).forEach((send) => send())
      },
    })
  })
  let uploaded = 0
  await page.route(`${SUPABASE_HOST}/storage/v1/object/post-photos/**`, async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    const body = request.postDataBuffer()!
    const form = await new Response(new Uint8Array(body), {
      headers: { 'content-type': request.headers()['content-type']! },
    }).formData()
    const file = form.get('')
    expect(file).toBeInstanceOf(File)
    if (!file || typeof file === 'string') throw new Error('画像ファイルがありません')
    expect(file.type).toBe('image/jpeg')
    expect(file.size).toBeGreaterThan(0)
    expect(file.size).toBeLessThanOrEqual(5 * 1024 * 1024)
    expect(file.size).toBeLessThan(body.length)
    expect(Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 2))).toEqual([0xff, 0xd8])
    uploaded++
    await route.fulfill({ status: 200, json: { Key: 'post-photos/resized.jpg' } })
  })
  await page.route(`${SUPABASE_HOST}/rest/v1/posts**`, (route) => route.fulfill(
    route.request().method() === 'POST'
      ? { status: 201, json: { id: 'posted-resized' } }
      : { json: [] },
  ))
  const dialog = await openForm(page)
  const photoStatus = dialog.getByRole('status').filter({ hasText: /写真を選ぶ|写真を準備中|投稿用の写真/ })
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 1200
    const context = canvas.getContext('2d')!
    context.fillStyle = '#c33333'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  // PNGのIEND後のpaddingは表示内容を変えず、原本容量だけ旧制限を超える。
  const original = {
    name: 'camera-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(6 * 1024 * 1024)]),
  }
  expect(original.buffer.length).toBeGreaterThan(5 * 1024 * 1024)
  const input = dialog.locator('input[type=file]')
  const releaseProcessing = async () => {
    await page.evaluate(() => {
      (window as unknown as { releasePhotoProcessing: () => void }).releasePhotoProcessing()
    })
  }
  await expect(photoStatus).toContainText('写真を選ぶと自動で小さくします')
  for (let selection = 0; selection < 2; selection++) {
    await page.evaluate(() => {
      (window as unknown as { holdPhotoProcessing: () => void }).holdPhotoProcessing()
    })
    await input.setInputFiles(original)
    await expect(photoStatus).toContainText('写真を準備中')
    await expect(dialog.getByRole('button', { name: /写真を準備中/ })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: '追加', exact: true })).toBeDisabled()
    await expect(input).toBeDisabled()
    await releaseProcessing()
    await expect(photoStatus).toContainText('投稿用の写真を準備しました')
    const preview = dialog.getByRole('img', { name: 'プレビュー1' })
    await expect(preview).toBeVisible()
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280)
    expect(await preview.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(853)
    expect(await input.inputValue()).toBe('')
    await expect(dialog.getByRole('button', { name: '🦞 投稿する', exact: true })).toBeEnabled()
    if (selection === 0) {
      await dialog.getByRole('button', { name: '写真1を削除', exact: true }).click()
      await expect(preview).toHaveCount(0)
      await expect(photoStatus).toContainText('写真を選ぶと自動で小さくします')
    }
  }
  await dialog.getByRole('button', { name: '🦞 投稿する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('投稿を受け付けました。管理者が確認後に公開されます。')).toBeVisible()
  expect(uploaded).toBe(1)
})

test('DB で 5 回失敗した後も入力を保持し、復旧後に再送できる', async ({ page }) => {
  await setupSignedIn(page)
  let attempts = 0
  await page.route(`${SUPABASE_HOST}/rest/v1/posts**`, async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    attempts++
    await route.fulfill(attempts <= 5
      ? { status: 500, json: { code: 'XX000', message: 'Temporary failure' } }
      : { status: 201, json: { id: 'posted-after-retry' } })
  })
  const dialog = await openForm(page)
  await dialog.getByLabel(/コメント/).fill('池の北側で確認')
  for (let attempt = 1; attempt <= 5; attempt++) {
    await dialog.getByRole('button', { name: '🦞 投稿する', exact: true }).click()
    await expect.poll(() => attempts).toBe(attempt)
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByRole('button', { name: '🦞 投稿する', exact: true })).toBeEnabled()
    expect(await page.evaluate((key) => localStorage.getItem(key), SUCCESS_KEY)).toBeNull()
  }
  await expect(dialog.getByLabel(/コメント/)).toHaveValue('池の北側で確認')
  await dialog.getByRole('button', { name: '🦞 投稿する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(attempts).toBe(6)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SUCCESS_KEY)).toHaveLength(1)
})
