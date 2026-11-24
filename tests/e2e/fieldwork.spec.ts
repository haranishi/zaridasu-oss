import { test, expect, type Page, type Request, type Route } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// REQ-330: 調査計画と希少種の記録。地図の「調査」から、計画を作る → 地図で 3 地点 → 並べ替え →
// 次の地点のカード → 「残りの地点をまとめて案内」の URL → 「いなかった」の不在の投稿（structured・市区町村つき）→
// 希少種の記録の送信内容（印は「希少種を自分の地図に表示」を入れたときだけ・紫の帯）→ 希少種のある地点では hidden →
// 「この計画をもう一度使う」で地点の id が変わっても場所で hidden（点検 B1）→ アカウント切替で前の人の計画が消える、までを通す。
//
// ログイン状態は private-spots-and-routes.spec.ts と同じく、@supabase/ssr が読む cookie を直接置いて作る。
// Supabase の REST は page.route で小さな PostgREST の代役を作ってモックする（行は利用者ごとに持つ）。

const SUPABASE_HOST = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
).replace(/\/+$/, '')
const SUPABASE_REF = new URL(SUPABASE_HOST).hostname.split('.')[0]
const AUTH_COOKIE_NAME = `sb-${SUPABASE_REF}-auth-token`

const USER_A = '00000000-0000-0000-0000-0000000000a1'
const USER_B = '00000000-0000-0000-0000-0000000000b2'

function makeUser(id: string) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id.slice(-2)}@example.com`,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
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

async function quietInit(page: Page, cookie: string) {
  await page.addInitScript(
    ([name, value]) => {
      try {
        // 2 回目以降の読み込み（アカウント切替の確認）でも、最初の人の cookie で上書きしない
        if (!document.cookie.includes(`${name}=`)) {
          document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`
        }
        window.localStorage.setItem('zaridasu_lang', 'ja')
        window.localStorage.setItem('zaridasu_intro_optout_v1', '1')
        window.localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
        window.localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
      } catch {
        /* noop */
      }
    },
    [AUTH_COOKIE_NAME, cookie] as const
  )
}

type Row = Record<string, unknown>

/** リクエストの JWT から利用者 ID を取る（RLS の代わり。自分の行だけ返す）。 */
function requester(req: Request): string | null {
  const auth = req.headers()['authorization'] ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').split('.')[1]
  if (!token) return null
  try {
    return (JSON.parse(Buffer.from(token, 'base64url').toString()) as { sub?: string }).sub ?? null
  } catch {
    return null
  }
}

/** PostgREST の絞り込み（eq / neq / in / gte / lte）だけを解釈する。同じ列に 2 つ付く（範囲）ので getAll で読む。 */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const key of new Set(params.keys())) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue
    const value = row[key] == null ? 'null' : String(row[key])
    for (const raw of params.getAll(key)) {
      if (raw.startsWith('eq.') && value !== raw.slice(3)) return false
      if (raw.startsWith('neq.') && value === raw.slice(4)) return false
      if (raw.startsWith('gte.') && !(Number(row[key]) >= Number(raw.slice(4)))) return false
      if (raw.startsWith('lte.') && !(Number(row[key]) <= Number(raw.slice(4)))) return false
      if (raw.startsWith('in.(')) {
        const list = raw.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''))
        if (!list.includes(value)) return false
      }
    }
  }
  return true
}

interface Db {
  survey_plans: Row[]
  survey_plan_stops: Row[]
  survey_stop_posts: Row[]
  rare_sightings: Row[]
  posts: Row[]
  reorders: { p_plan_id: string; p_stop_ids: string[] }[]
}

const OWNED = ['survey_plans', 'survey_plan_stops', 'survey_stop_posts', 'rare_sightings'] as const

function withDefaults(table: string, body: Row, uid: string | null): Row {
  const now = new Date().toISOString()
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const base: Row = { id: randomUUID(), created_at: now, updated_at: now, user_id: uid, ...body }
  if (table === 'survey_plans') return { planned_on: today, status: 'active', note: null, ...base }
  if (table === 'survey_plan_stops') return { status: 'pending', visited_at: null, name: null, note: null, source_id: null, ...base }
  if (table === 'rare_sightings') return { photo_paths: [], ...base }
  return base
}

async function mockSupabase(page: Page): Promise<Db> {
  const db: Db = { survey_plans: [], survey_plan_stops: [], survey_stop_posts: [], rare_sightings: [], posts: [], reorders: [] }
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  // 後に登録した route が優先されるので、キャッチオールを最初に置く
  await page.route(`${SUPABASE_HOST}/**`, (route) => json(route, 200, []))
  await page.route(`${SUPABASE_HOST}/auth/v1/user**`, (route) => json(route, 200, makeUser(requester(route.request()) ?? USER_A)))
  await page.route(`${SUPABASE_HOST}/rest/v1/user_onboarding**`, (route) => json(route, 200, { region: 'central' }))
  await page.route(`${SUPABASE_HOST}/rest/v1/rpc/get_my_experiment_variants**`, (route) => json(route, 200, {}))
  await page.route(`${SUPABASE_HOST}/rest/v1/rpc/reorder_survey_plan_stops**`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Db['reorders'][number]
    db.reorders.push(body)
    body.p_stop_ids.forEach((id, i) => {
      const stop = db.survey_plan_stops.find((s) => s.id === id)
      if (stop) stop.sort_order = i
    })
    await route.fulfill({ status: 204, body: '' })
  })

  await page.route(`${SUPABASE_HOST}/rest/v1/posts**`, async (route) => {
    const req = route.request()
    const uid = requester(req)
    if (req.method() === 'PATCH') {
      // 希少種を記録したあとの非公開化（hideOwnPostLocation）。自分の投稿だけ
      const patch = JSON.parse(req.postData() ?? '{}') as Row
      const hit = db.posts.filter((r) => r.user_id === uid && matches(r, new URL(req.url()).searchParams))
      hit.forEach((r) => Object.assign(r, patch))
      return json(route, 200, hit.map((r) => ({ id: r.id, location_disclosure: r.location_disclosure })))
    }
    if (req.method() !== 'POST') return json(route, 200, [])
    const body = JSON.parse(req.postData() ?? '{}') as Row
    const row = { id: randomUUID(), ...body }
    db.posts.push(row)
    return json(route, 201, { id: row.id })
  })
  // 市区町村の逆ジオコーディング（投稿フォームと不在の投稿が同じ関数で引く）
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    json(route, 200, { address: { city: '秋田市', state: '秋田県' } })
  )

  for (const table of OWNED) {
    await page.route(new RegExp(`^${SUPABASE_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rest/v1/${table}(\\?|$)`), async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const uid = requester(req)
      const rows = db[table]
      const mine = (r: Row) => r.user_id === uid
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const wantsRows = (req.headers()['prefer'] ?? '').includes('return=representation')
      const method = req.method()
      if (method === 'GET') {
        let found = rows.filter((r) => mine(r) && matches(r, url.searchParams))
        if (table === 'survey_plan_stops') found = [...found].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        if (table === 'survey_plans') found = [...found].reverse()
        return json(route, 200, single ? (found[0] ?? null) : found)
      }
      if (method === 'POST') {
        const body = JSON.parse(req.postData() ?? '{}') as Row | Row[]
        const list = (Array.isArray(body) ? body : [body]).map((b) => withDefaults(table, b, uid))
        if (table === 'rare_sightings' && rows.some((r) => r.client_id === list[0]!.client_id)) {
          return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint' })
        }
        rows.push(...list)
        if (!wantsRows) return route.fulfill({ status: 201, body: '' })
        return json(route, 201, single ? list[0] : list)
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(req.postData() ?? '{}') as Row
        const hit = rows.filter((r) => mine(r) && matches(r, url.searchParams))
        hit.forEach((r) => Object.assign(r, patch))
        return json(route, 200, hit)
      }
      if (method === 'DELETE') {
        const hit = rows.filter((r) => mine(r) && matches(r, url.searchParams))
        db[table] = rows.filter((r) => !hit.includes(r)) as never
        return json(route, 200, hit)
      }
      return json(route, 200, [])
    })
  }
  return db
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

for (const width of [390, 768, 1440]) {
  test(`調査画面: ${width}pxで計画・地点・希少種シートの操作と配置を保つ`, async ({ page, context }, testInfo) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 39.72, longitude: 140.1, accuracy: 20 })
    await quietInit(page, sessionCookieValue(makeUser(USER_A)))
    const db = await mockSupabase(page)
    const plan = withDefaults('survey_plans', { title: '水辺の調査' }, USER_A)
    db.survey_plans.push(plan)
    db.survey_plan_stops.push(...[0, 1].map((sort_order) => withDefaults('survey_plan_stops', {
      plan_id: plan.id, name: `調査地点 ${sort_order + 1}`, sort_order, source: 'pin',
      lat: 39.72 + sort_order * 0.001, lng: 140.1,
    }, USER_A)))
    await page.goto('/map')
    await page.getByTestId('fieldwork-open').click({ timeout: 60_000 })
    const panel = page.getByTestId('fieldwork-panel')
    await expect(panel.getByTestId('fieldwork-stop-row')).toHaveCount(2)
    const shot = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const path = testInfo.outputPath(`${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      await testInfo.attach(name, { path, contentType: 'image/png' })
    }
    await shot('plan')
    await panel.getByTestId('fieldwork-stop-row').first().getByRole('button').first().click()
    const stop = page.getByTestId('fieldwork-stop-sheet')
    await expect(stop).toBeVisible()
    await expect(stop.getByTestId('fieldwork-position')).not.toContainText('確認しています')
    await shot('stop')
    await stop.getByTestId('fieldwork-stop-rare').focus()
    await expect(stop.getByTestId('fieldwork-stop-rare')).toBeFocused()
    await page.keyboard.press('Enter')
    const rare = page.getByTestId('fieldwork-rare-sheet')
    await expect(rare).toBeVisible()
    await rare.getByTestId('fieldwork-rare-species-medaka').click()
    await expect(rare).toContainText('この記録は、あなたと運営だけが見られます')
    await shot('rare')
    await page.keyboard.press('Escape')
    await expect(rare).toHaveCount(0)
  })
}

test('調査: 計画を作り、地図で 3 地点を足して並べ替え、まとめて開く・いなかった・希少種を記録し、アカウント切替で前の人の計画が消える', async ({ page, context }) => {
  test.setTimeout(180_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 39.72, longitude: 140.1, accuracy: 20 })
  await quietInit(page, sessionCookieValue(makeUser(USER_A)))
  const db = await mockSupabase(page)
  await page.goto('/map')

  // 1. 調査パネルを開いて、今日の計画を作る
  const open = page.getByTestId('fieldwork-open')
  await expect(open).toBeVisible({ timeout: 60_000 })
  await open.click()
  const panel = page.getByTestId('fieldwork-panel')
  await expect(panel).toBeVisible()
  // パネルを開いている間は右下の「調査」ボタンを隠す（パネルの見出しと重複するため）
  await expect(open).toHaveCount(0)
  // 計画が無いときは「調査の計画を作る」。予定日は 16 時以降なら明日が選ばれているので、ここでは今日を選ぶ
  await expect(panel).toContainText('調査の計画はまだありません')
  await panel.getByTestId('fieldwork-new-today').click()
  await panel.getByTestId('fieldwork-create-today').click()
  await expect(panel.getByTestId('fieldwork-plan-title')).toHaveText(/の調査$/)
  await expect(panel.getByTestId('fieldwork-plan-day')).toHaveText('今日の計画')
  expect(db.survey_plans).toHaveLength(1)
  const planTitle = String(db.survey_plans[0]!.title)

  // 2. 地図で選ぶ: 地図を 3 回押して地点を足す（PC の右パネルに重ならない左側を押す）
  await panel.getByTestId('fieldwork-pick-on-map').click()
  // PC でも地図の下端に「地図を押して地点を足す（いまN地点）［終わる］」の帯を出す（採点 2 周目 A4）
  const pickBar = page.getByTestId('fieldwork-pick-bar')
  await expect(pickBar).toContainText('地図を押して地点を足す（いま0地点）')
  const box = await page.locator('.zari-map-main').boundingBox()
  if (!box) throw new Error('map not found')
  const spots = [
    [0.18, 0.35],
    [0.3, 0.55],
    [0.42, 0.4],
  ] as const
  for (const [i, [fx, fy]] of spots.entries()) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    await expect(panel.getByTestId('fieldwork-stop-row')).toHaveCount(i + 1)
  }
  await expect(pickBar).toContainText('（いま3地点）')
  // Esc でも終われる
  await page.keyboard.press('Escape')
  await expect(pickBar).toHaveCount(0)
  await expect(panel.getByTestId('fieldwork-pick-on-map')).toHaveAttribute('aria-pressed', 'false')
  expect(db.survey_plan_stops.map((s) => s.source)).toEqual(['pin', 'pin', 'pin'])
  expect(db.survey_plan_stops.map((s) => s.sort_order)).toEqual([0, 1, 2])
  await expect(page.locator('.leaflet-marker-icon[title^="3. "]')).toHaveCount(1)

  // 3. 並べ替え: 3 番目を 1 つ上へ（↑↓ ボタン。計画の地点を全部渡す RPC）
  const [first, second, third] = db.survey_plan_stops.map((s) => String(s.id))
  await panel.getByTestId('fieldwork-stop-row').nth(2).getByTestId('fieldwork-stop-up').click()
  await expect.poll(() => db.reorders.length).toBe(1)
  expect(db.reorders[0]).toEqual({ p_plan_id: db.survey_plans[0]!.id, p_stop_ids: [first, third, second] })

  // 4. 次の地点のカード（今日の計画の未調査の先頭）と、残りの地点をまとめて案内（開いた中に安全の一言、そのあとに
  //    Google マップの URL。座標だけ・経由地 2・目的地は並べ替え後の最後）。パネルに経路の 3 社ボタンは置かない
  await expect(panel.getByTestId('fieldwork-next-card')).toContainText('地点 1')
  await expect(panel.getByTestId('route-links')).toHaveCount(0)
  await expect(panel.getByTestId('fieldwork-bulk-open')).toHaveText(/残りの地点をまとめて案内（3地点）/)
  await panel.getByTestId('fieldwork-bulk-open').click()
  const bulkSafety = panel.getByTestId('fieldwork-safety')
  await expect(bulkSafety.getByRole('listitem')).toHaveText(['水に入らない', '子どもだけで行かない', '立入禁止の場所・私有地に入らない'])
  const links = panel.getByTestId('fieldwork-bulk-link')
  await expect(links).toHaveCount(1)
  const href = (await links.first().getAttribute('href')) ?? ''
  const coord = (s: Row) => `${Number(s.lat).toFixed(6)}%2C${Number(s.lng).toFixed(6)}`
  const byId = (id: string) => db.survey_plan_stops.find((s) => s.id === id)!
  expect(href).toBe(
    `https://www.google.com/maps/dir/?api=1&destination=${coord(byId(second!))}&travelmode=driving&waypoints=${coord(byId(first!))}%7C${coord(byId(third!))}`
  )
  expect(href.length).toBeLessThanOrEqual(2048)

  // 5. 次の地点のカードから 1 番目の地点を開き「いなかった」: 不在の投稿は structured・市区町村つき・位置の公開は DB の既定
  //    （hidden を送らない）。管理者でないので「運営が確認してから公開」と出す（DB が pending にする）
  await panel.getByTestId('fieldwork-next-open').click()
  const sheet = page.getByTestId('fieldwork-stop-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('fieldwork-safety')).toBeVisible()
  await expect(sheet.getByTestId('route-links').locator('a')).toHaveCount(3)
  await expect(sheet.getByTestId('fieldwork-position')).not.toContainText('確認しています', { timeout: 15_000 })
  await sheet.getByTestId('fieldwork-stop-absent').click()
  const confirm = page.getByTestId('fieldwork-absence-confirm')
  await expect(confirm).toBeVisible()
  await expect(confirm.getByTestId('fieldwork-absence-review')).toHaveText('不在の記録は、運営が確認してから公開されます')
  const [absenceReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/posts') && r.method() === 'POST'),
    confirm.getByTestId('fieldwork-absence-submit').click(),
  ])
  const absence = JSON.parse(absenceReq.postData() ?? '{}') as Row
  expect(absence).toMatchObject({
    user_id: USER_A,
    species: 'american',
    info_type: 'absence',
    survey_method: 'structured',
    municipality: '秋田市',
  })
  expect(absence).not.toHaveProperty('location_disclosure')
  await expect(confirm).toHaveCount(0)
  await expect.poll(() => db.survey_stop_posts.length).toBe(1)
  expect(db.survey_stop_posts[0]).toMatchObject({ stop_id: first, kind: 'absence', user_id: USER_A })
  await expect(panel.getByTestId('fieldwork-stop-row').nth(0)).toContainText('済み')

  // 6. 2 番目の地点で希少種を記録: client_id つき・本人と運営だけの表に入る（写真なし）
  await panel.getByTestId('fieldwork-stop-row').nth(1).getByTestId('fieldwork-stop-name').click()
  await expect(sheet.getByTestId('fieldwork-position')).not.toContainText('確認しています', { timeout: 15_000 })
  await sheet.getByTestId('fieldwork-stop-rare').click()
  const rareSheet = page.getByTestId('fieldwork-rare-sheet')
  await expect(rareSheet).toBeVisible()
  await expect(rareSheet).toContainText('この記録は、あなたと運営だけが見られます。ほかの人の地図・一覧・公開データには出ません。')
  await rareSheet.getByTestId('fieldwork-rare-species-medaka').click()
  await rareSheet.getByLabel('数（任意）').fill('12')
  const [rareReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/rare_sightings') && r.method() === 'POST'),
    rareSheet.getByTestId('fieldwork-rare-submit').click(),
  ])
  const rare = JSON.parse(rareReq.postData() ?? '{}') as Row
  expect(rare).toMatchObject({ user_id: USER_A, stop_id: third, species_key: 'medaka', species_label: null, count: 12, photo_paths: [] })
  expect(String(rare.client_id)).toMatch(/^[0-9a-f-]{36}$/)
  expect(['gps', 'map']).toContain(rare.location_source)
  await expect(rareSheet).toHaveCount(0)
  await expect(page.getByText('非公開で記録しました（希少種タブで見られます）')).toBeVisible()
  // 「希少種を自分の地図に表示」を入れるまで、一覧に希少種の印を出さない（採点 A1）
  await expect(panel.getByTestId('fieldwork-stop-row').nth(1)).not.toContainText('希少種あり')
  await expect(panel.getByTestId('fieldwork-rare-lock')).toHaveCount(0)

  // 6b. 希少種タブで表示を入れる: 一覧に印が出て、地図の上端に紫の帯。パネルを畳んでも帯は残り、［隠す］で切れる（採点 A2）
  await panel.getByTestId('fieldwork-tab-rare').click()
  await panel.getByTestId('fieldwork-show-rare').click()
  const band = page.getByTestId('fieldwork-rare-band')
  await expect(band).toContainText('希少種を表示中・画面写真に注意')
  await panel.getByRole('tab', { name: '調査計画' }).click()
  await expect(panel.getByTestId('fieldwork-stop-row').nth(1)).toContainText('希少種あり')
  await panel.getByTestId('fieldwork-collapse').click()
  await expect(band).toBeVisible()
  await band.getByRole('button', { name: '隠す' }).click()
  await expect(band).toHaveCount(0)
  await page.getByTestId('fieldwork-open').click()
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('fieldwork-stop-row').nth(1)).not.toContainText('希少種あり')

  // 7. 希少種のある地点で「いなかった」: 投稿の位置は hidden。表示を切っている間の地点シートには
  //    非公開の固定を示すものを何も出さず（採点 2 周目 A7）、確認の中でだけ理由を書かずに出す
  await panel.getByTestId('fieldwork-stop-row').nth(1).getByTestId('fieldwork-stop-name').click()
  await expect(sheet.getByTestId('fieldwork-position')).not.toContainText('確認しています', { timeout: 15_000 })
  await expect(sheet.getByTestId('fieldwork-stop-private')).toHaveCount(0)
  await expect(sheet).not.toContainText('希少種あり')
  await expect(sheet).not.toContainText('公開しません')
  await sheet.getByTestId('fieldwork-stop-absent').click()
  await expect(confirm.getByTestId('fieldwork-absence-private')).toHaveText('この地点の記録は、位置を公開しません')
  const [hiddenReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/posts') && r.method() === 'POST'),
    confirm.getByTestId('fieldwork-absence-submit').click(),
  ])
  expect(JSON.parse(hiddenReq.postData() ?? '{}')).toMatchObject({
    info_type: 'absence',
    survey_method: 'structured',
    location_disclosure: 'hidden',
  })
  await expect(confirm).toHaveCount(0)

  // 7b. 「この計画をもう一度使う」: 地点の id は新しくなるが、前の記録の場所（300 m 以内）で保護が続く（点検 B1）
  const oldStopIds = new Set(db.survey_plan_stops.map((s) => String(s.id)))
  await panel.getByTestId('fieldwork-reuse').click()
  await expect.poll(() => db.survey_plans.length).toBe(2)
  await expect(panel.getByTestId('fieldwork-stop-row')).toHaveCount(3)
  const newStops = db.survey_plan_stops.filter((s) => !oldStopIds.has(String(s.id)))
  expect(newStops).toHaveLength(3)
  // 新しい地点には、どの希少種の記録も付いていない（id では判定できない）
  expect(db.rare_sightings.some((r) => newStops.some((s) => s.id === r.stop_id))).toBe(false)
  await panel.getByTestId('fieldwork-stop-row').nth(1).getByTestId('fieldwork-stop-name').click()
  await expect(sheet.getByTestId('fieldwork-position')).not.toContainText('確認しています', { timeout: 15_000 })
  await sheet.getByTestId('fieldwork-stop-absent').click()
  // 画面の判定でも（場所で）保護される: 確認の中に「位置を公開しません」
  await expect(confirm.getByTestId('fieldwork-absence-private')).toBeVisible()
  const [reusedReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/rest/v1/posts') && r.method() === 'POST'),
    confirm.getByTestId('fieldwork-absence-submit').click(),
  ])
  expect(JSON.parse(reusedReq.postData() ?? '{}')).toMatchObject({ info_type: 'absence', location_disclosure: 'hidden' })
  await expect(confirm).toHaveCount(0)

  // 8. アカウント切替: 別の人の cookie に替えて画面に戻る（別のタブで入り直した後と同じ）。前の人の計画は出ない
  await expect(page.locator('.leaflet-marker-icon[title^="1. "]')).toHaveCount(1)
  const cookieB = sessionCookieValue(makeUser(USER_B))
  await page.evaluate(
    ([name, value]) => {
      document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    },
    [AUTH_COOKIE_NAME, cookieB] as const
  )
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.leaflet-marker-icon[title^="1. "]')).toHaveCount(0)
  await page.getByTestId('fieldwork-open').click()
  await expect(page.getByTestId('fieldwork-create-today')).toBeVisible()
  await expect(page.getByTestId('fieldwork-panel')).not.toContainText(planTitle)
  await expect(page.getByTestId('fieldwork-stop-row')).toHaveCount(0)
})

test('ピンの吹き出しから「計画に入れる」で今日の計画に地点が入り、「希少種を記録」で希少種シートが開く', async ({ page }) => {
  test.setTimeout(120_000)
  await quietInit(page, sessionCookieValue(makeUser(USER_A)))
  const db = await mockSupabase(page)
  await page.goto('/map')
  await expect(page.getByTestId('pin-mode-toggle')).toBeVisible({ timeout: 60_000 })
  const box = await page.locator('.zari-map-main').boundingBox()
  if (!box) throw new Error('map not found')

  // 右クリック（スマホでは長押し）でピンを立て、吹き出しの「計画に入れる」
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5, { button: 'right' })
  const popup = page.locator('.leaflet-popup-content')
  await popup.getByRole('button', { name: '計画に入れる' }).click()
  const panel = page.getByTestId('fieldwork-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('fieldwork-stop-row')).toHaveCount(1)
  expect(db.survey_plans).toHaveLength(1)
  expect(db.survey_plan_stops).toMatchObject([{ source: 'pin', source_id: null, sort_order: 0, user_id: USER_A }])

  // もう一度ピンを立てて「希少種を記録」: 計画の外の記録として希少種シートが開く
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.6, { button: 'right' })
  await popup.getByRole('button', { name: '希少種を記録' }).click()
  const rareSheet = page.getByTestId('fieldwork-rare-sheet')
  await expect(rareSheet).toBeVisible()
  await expect(rareSheet).toContainText('この記録は、あなたと運営だけが見られます')
  await expect(rareSheet.getByTestId('fieldwork-rare-submit')).toHaveText(/希少種を記録する（非公開）/)

  // 記録してから、同じピン（＝記録した位置）の「ここで投稿」を開くと、位置は非公開に固定される（2 周目の点検 C6）。
  // 右クリックし直すと、吹き出しを開いたときの自動の移動で地図がずれて別の位置になるので、残っているピンを押して開く
  await rareSheet.getByTestId('fieldwork-rare-species-medaka').click()
  await rareSheet.getByTestId('fieldwork-rare-submit').click()
  await expect(rareSheet).toHaveCount(0)
  await expect.poll(() => db.rare_sightings.length).toBe(1)
  await page.getByRole('button', { name: '立てたピン' }).click()
  await popup.getByRole('button', { name: /ここで投稿/ }).click()
  await expect(page.getByTestId('postform-disclosure-locked')).toHaveText(/この地点の記録は、位置を公開しません/)
  await expect(page.getByTestId('postform-disclosure-private')).toHaveAttribute('aria-pressed', 'true')
})

test('390: 「希少種を表示中」の帯は地図のすぐ上に差し込み、地図を下げて印を隠さない（採点 2 周目 A3）', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await quietInit(page, sessionCookieValue(makeUser(USER_A)))
  await mockSupabase(page)
  await page.goto('/map')
  const mapBefore = await page.locator('.zari-map-main').boundingBox()
  await page.getByTestId('fieldwork-open').click({ timeout: 60_000 })
  const panel = page.getByTestId('fieldwork-panel')
  await panel.getByTestId('fieldwork-tab-rare').click()
  await panel.getByTestId('fieldwork-show-rare').click()
  const band = page.getByTestId('map-top-slot').getByTestId('fieldwork-rare-band')
  await expect(band).toBeVisible()
  const bandBox = (await band.boundingBox())!
  const mapAfter = (await page.locator('.zari-map-main').boundingBox())!
  // 帯は地図の外（上）にあり、地図はその分だけ下がる
  expect(mapAfter.y).toBeGreaterThanOrEqual(bandBox.y + bandBox.height - 1)
  expect(mapAfter.y).toBeGreaterThan(mapBefore!.y)
  // 地図の上に重ねた「地図／写真」の切り替えも地図と一緒に下がり、帯の文字に重ならない
  // ResizeObserver が帯の高さを測って切り替えの位置を更新するまで待つ。
  // 帯自体の可視化と、その後のレイアウト通知は同じフレームとは限らない。
  const panelSwitch = page.getByTestId('home-panel-switch')
  await expect.poll(async () => (await panelSwitch.boundingBox())!.y).toBeGreaterThanOrEqual(bandBox.y + bandBox.height - 1)
  const switchBox = (await panelSwitch.boundingBox())!
  // ［隠す］は押せる高さ 44px 以上
  const hide = band.getByRole('button', { name: '隠す' })
  expect((await hide.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await hide.click()
  await expect(page.getByTestId('fieldwork-rare-band')).toHaveCount(0)
  await expect.poll(async () => (await page.locator('.zari-map-main').boundingBox())!.y).toBeLessThan(mapAfter.y)
  // 帯を隠したら切り替えも元の位置（地図の上端から 8px）へ戻る
  await expect.poll(async () => (await page.getByTestId('home-panel-switch').boundingBox())!.y).toBeLessThan(switchBox.y)
})
