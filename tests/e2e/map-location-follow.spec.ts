import { test, expect, type Page } from '@playwright/test'
import { prepareMapPosts, syntheticMapPosts } from './fixtures/map-posts'

// 地図の現在地の追従（.kiro/specs/map-location-follow）。実際の Next と Leaflet で、ブラウザの位置情報を差し替えながら確かめる。
//
// 「更新が本当に反映されたか」は、地図に置いた目印（公開投稿のマーカー）から青い点が何px離れて見えるかで測る。
// 点が画面の中心に居るかだけを見ると、更新を捨てて古い点のまま止まっていても通ってしまう（独立レビューの指摘）。
test.use({ serviceWorkers: 'block' })

// 桁の多い座標。通信にこの数字が出ていたら、位置が外へ出ている。
const START = { latitude: 39.723456, longitude: 140.134567, accuracy: 25 }
// 北へ約5.6km・東へ約3.4km。画面1つ分より遠いので、追従しなければ点は画面の外に出る
const NEXT = { latitude: 39.773456, longitude: 140.174567, accuracy: 25 }
// 立て続けに動く位置（NEXT の北へ 0.002° ずつ。3回で 0.006°）の分も含む
const LEAKS = ['39.7234', '140.1345', '39.7734', '140.1745', '39.7754', '39.7774', '39.7794', '39.7764']

// ズーム14（最初の位置で寄せたとき）の、緯度1°あたりのpx（256×2^14/360 ÷ cos(緯度)）。北へ 0.001° ≒ 15.1px
const PX_PER_LAT_DEGREE = (256 * 2 ** 14) / 360 / Math.cos((39.77 * Math.PI) / 180)
const NORTH = (degrees: number) => -degrees * PX_PER_LAT_DEGREE // 画面の上＝北＝yが小さい

const DOT = 'path.leaflet-interactive[fill="#3B82F6"]'
const MARKER = '.zari-map-main .leaflet-marker-icon:has(.zari-marker-wiggle)'

/** 地図に置く目印（公開投稿1件）。 */
const anchorAt = ({ latitude, longitude }: { latitude: number; longitude: number }) => [{ ...syntheticMapPosts(1)[0]!, lat: latitude, lng: longitude }]

/** 青い点（現在地）の中心が、地図の中心から何px離れているか。点が画面に無ければ null。 */
async function dotOffset(page: Page) {
  const map = await page.locator('.zari-map-main').boundingBox()
  const dot = page.locator(DOT)
  if (!map || (await dot.count()) === 0) return null
  const box = await dot.first().boundingBox()
  if (!box) return null
  return Math.hypot(box.x + box.width / 2 - (map.x + map.width / 2), box.y + box.height / 2 - (map.y + map.height / 2))
}

/** 青い点の上端近く（中心の4px上＝点の中で、目印のアイコンの箱の中でもある）が、点自身に当たるか。マーカーやまとまりに隠れていれば false。 */
async function dotIsOnTop(page: Page) {
  return page.evaluate((selector) => {
    const dot = document.querySelector(selector)
    if (!dot) return false
    const r = dot.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2 - 4) === dot
  }, DOT)
}

/** 青い点が、目印の足元（アイコンの下辺の中央＝地理上の位置）から、どちらへ何px離れているか。 */
async function dotVsMarker(page: Page) {
  const dot = page.locator(DOT)
  const marker = page.locator(MARKER)
  if ((await dot.count()) === 0 || (await marker.count()) === 0) return null
  const d = await dot.first().boundingBox()
  const m = await marker.first().boundingBox()
  if (!d || !m) return null
  const dx = d.x + d.width / 2 - (m.x + m.width / 2)
  const dy = d.y + d.height / 2 - (m.y + m.height)
  return { dx, dy }
}

/** 青い点が、目印から (dx, dy) px の位置に見えるまで待つ。目印が画面に無ければ、まだ着いていない。 */
async function expectDotAt(page: Page, expected: { dx: number; dy: number }, timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const r = await dotVsMarker(page)
        return r ? Math.hypot(r.dx - expected.dx, r.dy - expected.dy) : Number.POSITIVE_INFINITY
      },
      { timeout, message: `青い点が目印から (${expected.dx.toFixed(0)}, ${expected.dy.toFixed(0)}) px の位置に見える` },
    )
    .toBeLessThan(14)
}

/** 目印のマーカーが、地図の見えている範囲に入っているか。外にあるとき、マーカーは地図から外されるか、画面の外に置かれる。 */
async function markerOnScreen(page: Page) {
  const map = await page.locator('.zari-map-main').boundingBox()
  const marker = page.locator(MARKER)
  if (!map || (await marker.count()) === 0) return false
  const box = await marker.first().boundingBox()
  return !!box && box.x + box.width > map.x && box.x < map.x + map.width && box.y + box.height > map.y && box.y < map.y + map.height
}

/** 起動時のエラー（ページの例外と、Reactの典型的なエラー）を集める。 */
function collectProblems(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && /same key|Encountered two children|hydration|didn't match|Minified React error|Cannot update a component|Maximum update depth/i.test(message.text())) {
      problems.push(`console.error: ${message.text()}`)
    }
  })
  return problems
}

const locateButton = (page: Page) => page.getByRole('button', { name: '現在地を表示', exact: true })

/** 最初の位置が届くまで遅れる端末（GPS が遅い）を再現する。実ブラウザの位置の差し替えは、すぐ返ってしまうので、取得の開始を遅らせる。 */
async function delayFirstFix(page: Page, ms: number) {
  await page.addInitScript((delay) => {
    const g = navigator.geolocation
    const realWatch = g.watchPosition.bind(g)
    const realClear = g.clearWatch.bind(g)
    const pending = new Map<number, { timer: number; real?: number }>()
    let next = 0
    g.watchPosition = (ok, ng, o) => {
      const id = ++next
      const entry: { timer: number; real?: number } = { timer: 0 }
      entry.timer = window.setTimeout(() => { entry.real = realWatch(ok, ng, o) }, delay)
      pending.set(id, entry)
      return id
    }
    g.clearWatch = (id) => {
      const entry = pending.get(id)
      if (!entry) return
      window.clearTimeout(entry.timer)
      if (entry.real !== undefined) realClear(entry.real)
      pending.delete(id)
    }
  }, ms)
}

/** 地図を指で (dx, dy) px 動かす。離す前に少し止まり、慣性（離したあとも動き続ける）を消す。 */
async function dragMap(page: Page, dx: number, dy = 0) {
  const map = await page.locator('.zari-map-main').boundingBox()
  if (!map) throw new Error('map not found')
  const from = { x: map.x + map.width * (dx < 0 ? 0.8 : 0.2), y: map.y + map.height * 0.3 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 16 })
  await page.waitForTimeout(200)
  await page.mouse.up()
}

test('現在地の追従: 点と地図が付いてくる／位置が立て続けに届いても止まらない／地図を動かすと追従だけ止まる／戻して再開／止める。座標は通信に出ない', async ({ page, context }) => {
  test.setTimeout(150_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(START)
  // 目印は NEXT に置く。START では画面の外（追従しなければ、点も目印も画面に出ない）
  const fixture = await prepareMapPosts(page, anchorAt(NEXT))
  const outgoing: string[] = []
  page.on('request', (request) => outgoing.push(`${request.url()} ${request.postData() ?? ''}`))
  const problems = collectProblems(page)

  await page.goto('/map')
  const locate = locateButton(page)
  await expect(locate).toBeVisible({ timeout: 60_000 })
  await expect(locate).toHaveAttribute('aria-pressed', 'false')
  // 開いただけでは、位置を取らず、点も出ない
  await expect(page.locator(DOT)).toHaveCount(0)

  // 押すと追従が始まり、最初の位置で点が画面の中心に来る
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'following', { timeout: 30_000 })
  await expect(locate).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
  // 追従を始めた最初の1回は、止め方の札が出る（第2周の評価で「追従中の止め方が画面から分からない」と指摘された）
  await expect(page.getByRole('status').filter({ hasText: 'もう一度押すと止まります' })).toBeVisible()

  // 画面1つ分より遠くへ動くと、地図が付いてきて、点が目印の真上（NEXT）に来る。更新を捨てていれば、目印は画面に出ない
  await context.setGeolocation(NEXT)
  await expectDotAt(page, { dx: 0, dy: 0 })
  // 点は目印のマーカーの真上に居る。マーカーの下に隠れず、いちばん上に見える
  expect(await dotIsOnTop(page)).toBe(true)
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
  await expect(locate).toHaveAttribute('data-follow-mode', 'following')

  // 位置が立て続けに届いても（滑らかな動きの最中に次が届く。車での連続した移動）、追従は止まらず、
  // 点は北へ 0.006° ぶん進んだ位置（目印の約91px上）で、画面の中心に居続ける
  for (const step of [1, 2, 3]) {
    await context.setGeolocation({ ...NEXT, latitude: NEXT.latitude + step * 0.002 })
    await page.waitForTimeout(250)
  }
  await expectDotAt(page, { dx: 0, dy: NORTH(0.006) })
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
  await expect(locate).toHaveAttribute('data-follow-mode', 'following')

  // 地図を指で動かすと、追従だけが止まる。ボタンの名前は変わらない
  const map = await page.locator('.zari-map-main').boundingBox()
  if (!map) throw new Error('map not found')
  const from = { x: map.x + map.width * 0.3, y: map.y + map.height * 0.3 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 150, from.y, { steps: 12 })
  await page.mouse.up()
  await expect(locate).toHaveAttribute('data-follow-mode', 'paused')
  await expect(locate).toHaveAttribute('aria-pressed', 'false')
  await expect(locate).toHaveAccessibleName('現在地を表示')

  // 一時停止中は、点だけが新しい位置（北へ 0.003°）へ動き、地図は動かない（点は中心から離れたままになる）
  await context.setGeolocation({ ...NEXT, latitude: NEXT.latitude + 0.003 })
  await expectDotAt(page, { dx: 0, dy: NORTH(0.003) })
  expect(await dotOffset(page)).toBeGreaterThan(80)

  // 押すと現在地へ戻って、追従を再開する
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'following')
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
  await expectDotAt(page, { dx: 0, dy: NORTH(0.003) })

  // もう一度押すと止まり、点が消える
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'off')
  await expect(page.locator(DOT)).toHaveCount(0)

  // 追従で取った位置の座標は、どの通信にも出ていない（地図の背景画像の要求は z/x/y だけで、座標を含まない）
  const leaked = outgoing.filter((line) => LEAKS.some((digits) => line.includes(digits)))
  expect(leaked).toEqual([])
  // 起動から停止までに、ページの例外も、Reactの典型的なエラーも、想定外の通信も出ていない
  expect(problems).toEqual([])
  expect(fixture.unexpected).toEqual([])
})

test('追従中は「現在の地図範囲内のみ」が自動でオフになり、範囲つきの検索が出ない。一時停止中は使える', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(START)
  const fixture = await prepareMapPosts(page, anchorAt(START))
  const withBounds = () => fixture.postQueries.filter((url) => url.searchParams.getAll('display_lat').length > 0).length

  await page.goto('/map')
  const locate = locateButton(page)
  const filter = page.getByRole('button', { name: '現在の地図範囲内のみ', exact: true })
  await expect(locate).toBeVisible({ timeout: 60_000 })

  // オンにすると、地図の範囲つきの検索が出る（この絞り込みが、地図の範囲をサーバーへ送る）
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(withBounds, { timeout: 10_000 }).toBeGreaterThan(0)
  const before = withBounds()

  // 追従を始めると、絞り込みがオフになり、知らせが出る
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'following', { timeout: 30_000 })
  await expect(filter).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 })
  await expect(page.getByText('「現在の地図範囲内のみ」をオフにしました')).toBeVisible()

  // 追従中に動いても、範囲つきの検索は出ない（デバウンスの300msより長く待つ）
  await context.setGeolocation({ ...START, latitude: START.latitude + 0.003 })
  await page.waitForTimeout(1500)
  expect(withBounds()).toBe(before)

  // 追従中にオンにされても、すぐオフに戻り、範囲つきの検索は出ない
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 })
  await page.waitForTimeout(1500)
  expect(withBounds()).toBe(before)

  // 地図を動かして追従が一時停止したら、絞り込みを使える（利用者が見る場所を選んでいる）
  const map = await page.locator('.zari-map-main').boundingBox()
  if (!map) throw new Error('map not found')
  await page.mouse.move(map.x + map.width * 0.3, map.y + map.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(map.x + map.width * 0.3 + 150, map.y + map.height * 0.3, { steps: 12 })
  await page.mouse.up()
  await expect(locate).toHaveAttribute('data-follow-mode', 'paused')
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(withBounds, { timeout: 10_000 }).toBeGreaterThan(before)
  await page.waitForTimeout(500)
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
})

// 体験評価の不具合：位置を待つ間に地図を動かしても、位置が届いた瞬間に引き戻されていた。待つ間に何も説明が出ない問題もあった
test('位置を待つ間は説明の札が出る。そのあいだに地図を動かしたら、位置が届いても引き戻されず、一時停止になる。押すと現在地へ戻る', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(START)
  await delayFirstFix(page, 6000)
  await prepareMapPosts(page, anchorAt(START))
  const problems = collectProblems(page)

  await page.goto('/map')
  const locate = locateButton(page)
  await expect(locate).toBeVisible({ timeout: 60_000 })
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'locating')
  await expect(locate).toHaveAttribute('aria-busy', 'true')
  // 取得中の点線の輪は、押した直後の実ブラウザで見える。outline で描くと、Leaflet が mousedown のたびに outline を消すので見えなくなる
  // （jsdom の試験では見つからない。第3周の体験評価で「出ていない」と指摘されて、初めて分かった）
  const ring = page.getByTestId('locate-searching-ring')
  await expect(ring).toBeVisible()
  expect(await ring.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed')

  // 3秒たっても位置が来ないので、説明の札が出る
  const locating = page.getByRole('status').filter({ hasText: '現在地を取得しています' })
  await expect(locating).toBeVisible({ timeout: 5_000 })
  // 位置を待つあいだに、地図を指で動かす
  await dragMap(page, -200)
  await expect(locate).toHaveAttribute('data-follow-mode', 'locating')

  // 最初の位置が届く：追従にならず一時停止。地図は引き戻されない（点は画面の中心にない）。取得中の札は消え、戻り方の札が出る
  await expect(locate).toHaveAttribute('data-follow-mode', 'paused', { timeout: 15_000 })
  await expect(locating).toHaveCount(0)
  const paused = page.getByRole('status').filter({ hasText: '一時停止中です' })
  await expect(paused).toBeVisible()
  const offset = await dotOffset(page)
  expect(offset === null || offset > 80).toBe(true)
  // 戻り方の札は、数秒（6秒）で消える
  await expect(paused).toHaveCount(0, { timeout: 10_000 })

  // 押すと、現在地へ戻って追従する
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'following')
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
  expect(problems).toEqual([])
})

// 体験評価の不具合：拒否のまま押し直すと、同じ通知が押した回数だけ積み重なり、画面の上半分を覆った
test('位置情報が許可されていないまま4回押しても、同じ通知は1枚だけ', async ({ page }) => {
  test.setTimeout(90_000)
  await prepareMapPosts(page, [])
  await page.goto('/map')
  const locate = locateButton(page)
  await expect(locate).toBeVisible({ timeout: 60_000 })
  const toast = page.getByText('位置情報の使用が許可されていません')
  for (let i = 0; i < 4; i++) {
    await locate.click()
    await expect(toast.first()).toBeVisible({ timeout: 20_000 })
    await expect(locate).toHaveAttribute('data-follow-mode', 'off')
  }
  await page.waitForTimeout(500)
  await expect(toast).toHaveCount(1)
})

// 体験評価で出た疑い：一時停止中に点が画面の外へ出て、地図を戻したあと、点が描かれなかったことが1回あった（道具の取りこぼしと判断）。製品側でも確かめる
test('一時停止中に点が画面の外へ出ても、地図を戻したら、点が正しい位置に見える', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation(START)
  await prepareMapPosts(page, anchorAt(START))
  const problems = collectProblems(page)

  await page.goto('/map')
  const locate = locateButton(page)
  await expect(locate).toBeVisible({ timeout: 60_000 })
  await locate.click()
  await expect(locate).toHaveAttribute('data-follow-mode', 'following', { timeout: 30_000 })
  await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)

  // 地図を大きく動かして一時停止にし、点を画面の外へ出す（画面の幅の半分より遠く）
  for (let i = 0; i < 3; i++) await dragMap(page, -300)
  await expect(locate).toHaveAttribute('data-follow-mode', 'paused')
  await expect.poll(() => markerOnScreen(page), { timeout: 5_000 }).toBe(false)
  // 点も画面の外に居る（目印と同じ場所）。その間にも、位置は更新される（北へ 0.001°）
  await context.setGeolocation({ ...START, latitude: START.latitude + 0.001 })
  await page.waitForTimeout(500)

  // 地図を戻すと、点と目印が見え、点は目印の北へ 0.001° の位置にある
  for (let i = 0; i < 3; i++) await dragMap(page, 300)
  await expectDotAt(page, { dx: 0, dy: NORTH(0.001) })
  expect(problems).toEqual([])
})

test('位置情報が許可されていないとき、取得を止めて理由を知らせる（実ブラウザが返すエラー）', async ({ page }) => {
  test.setTimeout(90_000)
  await prepareMapPosts(page, [])
  await page.goto('/map')
  const locate = locateButton(page)
  await expect(locate).toBeVisible({ timeout: 60_000 })
  await locate.click()
  await expect(page.getByText('位置情報の使用が許可されていません')).toBeVisible({ timeout: 20_000 })
  await expect(locate).toHaveAttribute('data-follow-mode', 'off')
  await expect(locate).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(DOT)).toHaveCount(0)
})

for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]] as const) {
  test(`現在地ボタン: ${width}pxで画面の中にあり、44px以上で、ほかの部品に覆われず、キーボードで押せる`, async ({ page, context }) => {
    test.setTimeout(90_000)
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(START)
    await page.setViewportSize({ width, height })
    await prepareMapPosts(page, [])
    await page.goto('/map')
    const locate = locateButton(page)
    await expect(locate).toBeVisible({ timeout: 60_000 })

    const box = await locate.boundingBox()
    if (!box) throw new Error('locate button not found')
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    // 中心を押したとき、ボタン自身に当たる（下部のナビや案内に覆われていない）
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-testid="map-locate"]') !== null, [box.x + box.width / 2, box.y + box.height / 2])
    expect(hit).toBe(true)

    // キーボードで押せる（Enterで始まり、もう一度Enterで止まる）
    await locate.focus()
    await page.keyboard.press('Enter')
    await expect(locate).toHaveAttribute('data-follow-mode', 'following', { timeout: 30_000 })
    await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)
    await page.keyboard.press('Enter')
    await expect(locate).toHaveAttribute('data-follow-mode', 'off')
  })
}

// 押すタイミングが関わる挙動は、等速の合格を安定の証拠にしない（Webハーネス§5・Day065の事例）。
// 位置が届く間隔を 0〜500ms に振り、ページのCPUを 1・10・20 倍遅くして流す。
// 滑らかな動き（1秒）が重なる間隔では、前の動きを止める moveend が先に出て、追従が勝手に止まる不具合があった。
// 点が中心に居るだけでは、更新を捨てていても通ってしまうので、START に置いた目印から北へ 0.016° ぶん進んだ位置に居ることを測る。
for (const gap of [0, 150, 500]) {
  for (const rate of [1, 10, 20]) {
    test(`追従は止まらない: 位置が${gap}ms間隔で8回届き、ページのCPUが${rate}倍遅くても、点が最後の位置の中心に居続ける`, async ({ page, context }) => {
      test.setTimeout(180_000)
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation(START)
      await prepareMapPosts(page, anchorAt(START))
      const problems = collectProblems(page)
      await page.goto('/map')
      const locate = locateButton(page)
      await expect(locate).toBeVisible({ timeout: 60_000 })
      await locate.click()
      await expect(locate).toHaveAttribute('data-follow-mode', 'following', { timeout: 30_000 })
      await expectDotAt(page, { dx: 0, dy: 0 }) // 最初の位置では、点が目印の真上に居る
      expect(await dotIsOnTop(page)).toBe(true) // マーカーの下に隠れない
      await expect.poll(() => dotOffset(page), { timeout: 15_000 }).toBeLessThan(12)

      // 読み込みのあとで遅くする（読み込みまで遅くすると、試験の主旨と関係なく時間がかかる）
      if (rate > 1) {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      }
      // 北へ 0.002°（約30px）ずつ。画面の中に収まり、毎回8px以上の動き＝毎回、地図を寄せる
      for (let step = 1; step <= 8; step++) {
        await context.setGeolocation({ ...START, latitude: START.latitude + step * 0.002 })
        if (gap > 0) await page.waitForTimeout(gap)
      }
      await expect(locate).toHaveAttribute('data-follow-mode', 'following')
      await expectDotAt(page, { dx: 0, dy: NORTH(0.016) }, 60_000)
      await expect.poll(() => dotOffset(page), { timeout: 60_000 }).toBeLessThan(12)
      await expect(locate).toHaveAttribute('data-follow-mode', 'following')
      expect(problems).toEqual([])
    })
  }
}
