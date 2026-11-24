import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test'
import { seedAdminSession } from './fixtures/admin-api'
import { TEST_MEMBER, TEST_SUPABASE_ORIGIN } from './fixtures/admin-auth.mjs'

// マイページの「活動の記録（草）」。ログイン済みの会員で /dashboard を開き、模擬の記録から草・合計・詳細・一覧・キーボードを確かめる。
// 通信はすべて模擬（本番の通信は使わない）。日付は今日（日本時間）からの相対で作る。
test.use({ serviceWorkers: 'block' })

const API = TEST_SUPABASE_ORIGIN
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }

const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const at = (daysAgo: number, hour = 3) => `${addDays(jstToday(), -daysAgo)}T${String(hour).padStart(2, '0')}:00:00Z`
const row = (daysAgo: number, over: Record<string, unknown> = {}, hour = 3) => ({
  observed_at: null, created_at: at(daysAgo, hour), info_type: 'sighting', status: 'approved', ...over,
})

// 日ごとの件数: 2日前=2件（うち審査待ち1）／9日前=6件（5件で頭打ち）／40日前=2件／200日前=1件。
// 数えないもの: 3日前の却下・400日前（範囲の外）。
const ROWS = [
  row(2), row(2, { info_type: 'absence', status: 'pending' }, 5),
  ...Array.from({ length: 6 }, (_, i) => row(9, {}, 3 + i)),
  row(40), row(40, { info_type: 'absence' }, 5),
  row(200, { info_type: 'capture' }),
  row(3, { status: 'rejected' }),
  row(400),
]

async function prepare(page: Page, context: BrowserContext, baseURL: string, mode: 'rows' | 'empty' | 'error' = 'rows', rows: unknown[] = ROWS) {
  await seedAdminSession(context, baseURL, false)
  await context.addInitScript(() => localStorage.setItem('zaridasu_onboarding_region_v1', 'central'))
  const state = { mode, activityCalls: 0 }
  const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, 'Content-Range': '*/0' }, json: data })
  await page.route('https://**/*', route => route.abort())
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/auth/v1/user') return json(route, TEST_MEMBER)
    if (path.endsWith('/rest/v1/user_onboarding')) return json(route, { region: 'central' }) // 初回の案内を出さない
    if (path.endsWith('/rpc/get_user_profile')) return json(route, { id: TEST_MEMBER.id, display_name: 'テスト探索者', avatar_emoji: '🌱', bio: '', post_count: 11, comment_count: 0, municipality_count: 2, badges: [] })
    if (path.endsWith('/rpc/get_user_progress')) return json(route, [{ xp: 90, level: 2, xp_into_level: 40, xp_for_next_level: 100, approved_count: 5 }])
    if (path.endsWith('/rest/v1/badge_definitions')) return json(route, [{ id: 'first', name: 'はじめの一歩', icon: '🌱', description: '最初の記録', min_approved: 1 }])
    if (path.endsWith('/rest/v1/posts') && (url.searchParams.get('select') ?? '').startsWith('observed_at')) {
      state.activityCalls += 1
      // 本人の審査待ち・承認済みだけを、本人のIDで取っている
      expect(url.searchParams.get('user_id')).toBe(`eq.${TEST_MEMBER.id}`)
      expect(url.searchParams.get('status')).toBe('in.(pending,approved)')
      if (state.mode === 'error') return json(route, { message: 'Synthetic failure' }, 500)
      return json(route, state.mode === 'empty' ? [] : rows)
    }
    return json(route, [])
  })
  return state
}

const card = (page: Page) => page.getByRole('region', { name: '活動の記録' })
const cell = (page: Page, daysAgo: number) => page.locator(`[role="gridcell"][data-date="${addDays(jstToday(), -daysAgo)}"]`)

test('マイページに、過去1年の活動の記録が、濃さ・合計・詳細つきで出る', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  await expect(card(page)).toBeVisible()
  expect(state.activityCalls).toBeGreaterThan(0)
  // 合計：4日・11件（却下と範囲の外は数えない）
  await expect(card(page).getByText('過去1年で4日、記録しました（11件）')).toBeVisible()
  await expect(card(page).getByText('審査待ちは数え、承認されなかった記録は数えません。')).toBeVisible()
  // 濃さ：2件=2、6件でも頭打ちで4、1件=1、却下だけの日=0
  await expect(cell(page, 2)).toHaveAttribute('data-level', '2')
  await expect(cell(page, 9)).toHaveAttribute('data-level', '4')
  await expect(cell(page, 40)).toHaveAttribute('data-level', '2')
  await expect(cell(page, 200)).toHaveAttribute('data-level', '1')
  await expect(cell(page, 3)).toHaveAttribute('data-level', '0')
  await expect(cell(page, 400)).toHaveCount(0)
  // はじめは最新の活動日を選び、件数・内訳・審査待ちを出す
  await expect(cell(page, 2)).toHaveAttribute('aria-selected', 'true')
  const detail = card(page).getByRole('status')
  await expect(detail).toContainText('最後に記録した日') // 本人はまだ選んでいない
  await expect(detail).toContainText('記録2件')
  await expect(detail).toContainText('目撃1')
  await expect(detail).toContainText('不在確認1')
  await expect(detail).toContainText('うち審査待ち1件')
})

test('置き場所は、進捗の下・バッジの上', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  await expect(card(page)).toBeVisible()
  const badges = page.getByRole('heading', { name: '獲得バッジ' })
  await expect(badges).toBeVisible()
  const [activity, badge] = await Promise.all([card(page).boundingBox(), badges.boundingBox()])
  expect(activity!.y + activity!.height).toBeLessThanOrEqual(badge!.y)
})

test('はじめは右端（今日の側）を見せ、390pxで画面を横にはみ出さない', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  await expect(card(page)).toBeVisible()
  // カードはマイページの下のほうにあるので、先に画面へ出す（横のスクロールは、出したあとの位置を見る）
  await expect(cell(page, 200)).toHaveCount(1)
  await card(page).scrollIntoViewIfNeeded()
  await expect(cell(page, 0)).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const scroller = card(page).locator('[role="grid"]').locator('xpath=ancestor::div[2]')
  expect(await scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  // 横に動かせることを、文と端の影で伝える。はじめは右端なので、続きがあるのは左側
  await expect(card(page).getByText('表を右へずらすと、1年前まで見られます。')).toBeVisible()
  const edges = card(page).locator('[data-more-left]')
  await expect(edges).toHaveAttribute('data-more-left', 'true')
  await expect(edges).toHaveAttribute('data-more-right', 'false')
  await scroller.evaluate(el => { el.scrollLeft = 0 })
  await expect(edges).toHaveAttribute('data-more-left', 'false')
  await expect(edges).toHaveAttribute('data-more-right', 'true')
})

test('矢印キーで日を移り、Enter で選ぶ。Tab の停止は1か所', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  await expect(card(page)).toBeVisible()
  expect(await card(page).locator('[role="gridcell"][tabindex="0"]').count()).toBe(1)
  // 1年分が入る幅では、横に動かす案内も端の影も出さない（マスを押す案内は出す）
  await expect(card(page).getByText('表を右へずらすと、1年前まで見られます。')).toBeHidden()
  await expect(card(page).getByText('マスか、下の一覧から日を選ぶと、内訳が出ます。')).toBeVisible()
  await expect(card(page).locator('[data-more-left]')).toHaveAttribute('data-more-left', 'false')
  await expect(card(page).locator('[data-more-left]')).toHaveAttribute('data-more-right', 'false')
  await cell(page, 2).focus()
  await page.keyboard.press('ArrowLeft') // 7日前＝9日前
  await expect(cell(page, 9)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cell(page, 9)).toHaveAttribute('aria-selected', 'true')
  await expect(card(page).getByRole('status')).toContainText('記録6件')
  await page.keyboard.press('ArrowDown')
  await expect(cell(page, 8)).toBeFocused()
})

test('記録した日の一覧から日を選べる（小さなセルの代わりに、押しやすい行で）', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  await card(page).getByRole('button', { name: '記録した日の一覧を開く' }).click()
  const items = card(page).getByRole('list').getByRole('button')
  await expect(items).toHaveCount(4)
  for (const item of await items.all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await items.last().click() // 200日前
  await expect(cell(page, 200)).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, 200)).toBeInViewport()
})

test('凡例は、濃さごとの件数を数字で書く', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!)
  await page.goto('/dashboard')
  const legend = card(page).locator('[class*="ActivityGrass_legend__"]')
  await expect(legend).toContainText('1日の記録数')
  await expect(legend).toContainText('3〜4')
  await expect(legend).toContainText('5以上')
  await expect(legend.locator('[data-level]')).toHaveCount(5)
})

test('一覧は新しい7日から。「さらに表示」で足し、内側のスクロールは使わない', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!, 'rows', Array.from({ length: 10 }, (_, i) => row(i + 1)))
  await page.goto('/dashboard')
  await card(page).getByRole('button', { name: '記録した日の一覧を開く' }).click()
  const list = card(page).getByRole('list')
  const items = list.getByRole('button')
  await expect(items).toHaveCount(7)
  expect(await list.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true) // 高さを固定した内側のスクロールではない
  await card(page).getByRole('button', { name: 'さらに表示（残り3日）' }).click()
  await expect(items).toHaveCount(10)
  await expect(card(page).getByRole('button', { name: /さらに表示/ })).toHaveCount(0)
})

test('一覧から日を選ぶと、画面の外にあった詳細が見える位置へ動く', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 520 })
  await prepare(page, context, baseURL!, 'rows', Array.from({ length: 10 }, (_, i) => row(i + 1)))
  await page.goto('/dashboard')
  await card(page).getByRole('button', { name: '記録した日の一覧を開く' }).click()
  await card(page).getByRole('button', { name: 'さらに表示（残り3日）' }).click()
  const items = card(page).getByRole('list').getByRole('button')
  await items.last().click() // 下の行を押すと、ページはそこまで動き、上にある詳細は画面の外へ出る
  await expect(items.last()).toHaveAttribute('aria-pressed', 'true')
  await expect(card(page).getByRole('status')).toBeInViewport()
  await expect(card(page).getByRole('status')).toContainText('選んだ日')
})

test('記録が1件も無ければ、空のカレンダーと最初の1日の案内・記録ボタンを出す', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!, 'empty')
  await page.goto('/dashboard')
  await expect(card(page).getByText('まだ記録がありません。最初の記録を投稿すると、その日のマスに色がつきます。')).toBeVisible()
  // 0日・0件の合計と、審査待ちの注記は、最初の1件が入るまで出さない
  await expect(card(page).getByText('過去1年で')).toHaveCount(0)
  await expect(card(page).getByText('承認されなかった記録は数えません')).toHaveCount(0)
  await expect(card(page).getByRole('link', { name: '記録を投稿する' })).toHaveAttribute('href', '/map?post=1')
  await expect(card(page).locator('[role="gridcell"][data-level]:not([data-level="0"])')).toHaveCount(0)
})

test('取得に失敗したら、空とは別の案内と再試行を出し、再試行で草が出る', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await prepare(page, context, baseURL!, 'error')
  await page.goto('/dashboard')
  await expect(card(page).getByRole('alert')).toContainText('活動の記録を読み込めませんでした。')
  await expect(card(page).getByText('まだ記録がありません')).toHaveCount(0)
  state.mode = 'rows'
  await card(page).getByRole('button', { name: '再試行' }).click()
  await expect(card(page).getByText('過去1年で4日、記録しました（11件）')).toBeVisible()
})

test('暗い配色でも、枠と段階が見える（枠はどのセルにも付く）', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, context, baseURL!)
  await context.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.goto('/dashboard')
  await expect(card(page)).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const styles = await page.evaluate(() => {
    const empty = document.querySelector('[role="gridcell"][data-level="0"]')!
    const dense = document.querySelector('[role="gridcell"][data-level="4"]')!
    const read = (el: Element) => ({ border: getComputedStyle(el).borderTopColor, background: getComputedStyle(el).backgroundColor })
    return { empty: read(empty), dense: read(dense) }
  })
  expect(styles.empty.border).toBe('rgb(93, 110, 126)') // #5d6e7e（暗地の枠）
  expect(styles.dense.border).toBe(styles.empty.border)
  expect(styles.dense.background).toBe('rgb(116, 198, 157)') // #74c69d（暗地の段階4）
  // 選んだ日の詳細の文字は、継承に頼ると黒のままになり、紺の地で読めなくなる（2026-10-19 に axe が検出）。WCAG の式で、全行の文字と下地の比を測る
  const ratios = await card(page).getByRole('status').evaluate(detail => {
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const luminance = (channels: number[]) => {
      const linear = channels.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
    }
    const ground = luminance(parse(getComputedStyle(detail).backgroundColor))
    return [...detail.querySelectorAll('p')].map(p => {
      const text = luminance(parse(getComputedStyle(p).color))
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
    })
  })
  expect(ratios.length).toBeGreaterThanOrEqual(3) // 日付・内訳・審査待ちの3行
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5)
})
