import { test, expect, type Page } from '@playwright/test'

const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const rows = Array.from({ length: 6 }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
  species: i % 2 ? 'bullfrog' : 'american', info_type: 'sighting', municipality: '秋田市',
  photos: [`/images/home/${i % 2 ? 'bullfrog' : 'crayfish'}-v2.webp`], comment: '合成の公開記録',
  created_at: `2026-10-${String(19 - i).padStart(2, '0')}T00:00:00Z`,
  likes: [{ id: `like-${i}` }], comments: i ? [] : [{ id: 'question-1', content: 'どの角度から撮ればよいですか？', created_at: '2026-10-19T00:00:00Z' }],
}))
// 記録が少ない時期の形: 写真つきの目撃が1件と、同じ日・同じ市の「見つからなかった」が5件（写真・いいね・質問なし）
const sparseRows = [
  { ...rows[0]!, id: '00000000-0000-0000-0000-000000000200', likes: [], comments: [], created_at: '2026-10-09T00:00:00Z' },
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(300 + i).padStart(12, '0')}`,
    species: 'american', info_type: 'absence', municipality: '由利本荘市',
    photos: [], comment: null, created_at: `2026-10-08T0${5 - i}:00:00Z`, likes: [], comments: [],
  })),
]

async function prepare(page: Page, mode: 'data' | 'empty' | 'error' | 'sparse' = 'data', signedIn = false) {
  const user = { id: '00000000-0000-0000-0000-000000000099', aud: 'authenticated', role: 'authenticated', email: 'home@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + 86400
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expires })}.signature`, refresh_token: 'fake-home-refresh', token_type: 'bearer', expires_in: 86400, expires_at: expires, user }
  await page.addInitScript(({ cookie, value }) => {
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
    localStorage.setItem('zaridasu_signup_banner_optout_v1', '1')
    localStorage.setItem('zaridasu_install_banner_optout_v1', '1')
    if (value) document.cookie = `${cookie}=${value}; path=/; SameSite=Lax`
  }, { cookie: `sb-${new URL(api).hostname.split('.')[0]}-auth-token`, value: signedIn ? `base64-${encode(session)}` : '' })
  await page.route('https://**/*', route => route.abort())
  await page.route(`${api}/**`, route => route.fulfill({ json: [] }))
  if (signedIn) await page.route(`${api}/auth/v1/user**`, route => route.fulfill({ json: user }))
  await page.route(`${api}/rest/v1/user_onboarding**`, route => route.fulfill({ json: { region: 'central' } }))
  await page.route(`${api}/rest/v1/rpc/get_user_profile**`, route => route.fulfill({ json: { id: user.id, display_name: 'テスト探索者', avatar_emoji: '🌱' } }))
  await page.route(`${api}/rest/v1/rpc/get_user_progress**`, route => route.fulfill({ json: [{ xp: 90, level: 2, xp_into_level: 40, xp_for_next_level: 100, approved_count: 5 }] }))
  await page.route(`${api}/rest/v1/rpc/get_user_collection**`, route => route.fulfill({ json: [{ species: 'american', verified_count: 5, info_types_seen: ['sighting'], municipalities_seen: ['秋田市'], first_observed_at: '2026-10-19T00:00:00Z' }] }))
  let failed = false
  const queries: URL[] = []
  await page.route(`${api}/rest/v1/posts**`, route => {
    const query = new URL(route.request().url())
    queries.push(query)
    // 失敗させるのは記録の一覧（likes を含む取得）だけ。「まだ足りない記録」の集計用の取得とは取り合わせない。
    if (mode === 'error' && !failed && query.searchParams.get('select')?.includes('likes')) { failed = true; return route.fulfill({ status: 500, json: { message: 'Synthetic failure' } }) }
    const source = mode === 'sparse' ? sparseRows : rows
    return route.fulfill({ json: mode === 'empty' ? [] : query.searchParams.has('id') ? source.filter(row => query.searchParams.get('id')!.includes(row.id)) : source })
  })
  return queries
}

for (const width of [390, 768, 1440]) {
  test(`ホームは${width}pxで全欄を表示し、ナビに隠れず閲覧できる`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const queries = await prepare(page)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    // 最初に、何のサービスか・何をすればよいか・誰がつくったかが分かる
    await expect(page.getByRole('heading', { name: /あなたの「見つけた」が、\s*秋田の自然を守る。/ })).toBeVisible()
    const main = page.locator('#main-content')
    await expect(main.getByText('ザリガニやウシガエルを見つけたら', { exact: false })).toBeVisible()
    await expect(main.getByText('ひとりの大学生がつくった', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: '無料で登録して記録する' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登録せずに地図を見る' })).toHaveAttribute('href', '/map')
    await expect(main.getByText('ようこそ、ザリダスへ')).toHaveCount(0)
    for (const name of ['ピックアップ', 'まだ足りない記録', '新着の記録', '人気の記録', '新着のしつもん', '図鑑', '記録ガイド', 'お知らせ']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    // 並び: ピックアップ → まだ足りない記録 → 新着の記録 → 人気の記録 → 新着のしつもん
    const tops = await page.evaluate(names => names.map(name => [...document.querySelectorAll('h2')].find(h => h.textContent?.trim() === name)!.getBoundingClientRect().top + scrollY), ['ピックアップ', 'まだ足りない記録', '新着の記録', '人気の記録', '新着のしつもん'])
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    await expect(main.getByText('どの角度から撮ればよいですか？')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const news = page.getByRole('region', { name: 'お知らせ' })
    await expect(news).toHaveAttribute('id', 'home-news')
    await news.scrollIntoViewIfNeeded()
    const last = news.getByRole('link', { name: /記録ガイドを見る/ })
    await expect(last).toBeInViewport()
    if (width < 1024) {
      const nav = page.locator('nav').filter({ has: page.getByRole('button', { name: '投稿する', exact: true }) })
      const [box, bottom] = await Promise.all([last.boundingBox(), nav.boundingBox()])
      expect(box!.y + box!.height).toBeLessThanOrEqual(bottom!.y)
    }
    expect(queries[0]?.searchParams.get('status')).toBe('eq.approved')
    expect(queries[0]?.searchParams.get('select')).not.toMatch(/display_lat|display_lng|user_id|email/)
    expect(errors).toEqual([])
    await expect(page.locator('.loading-screen')).toHaveCount(0)
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0) })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: testInfo.outputPath('home-viewport.png') })
    await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
  })
}

test('ピックアップに出した記録は、新着の記録には出さない（同じ写真が続けて並ばない）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  const links = (name: string) => page.getByRole('region', { name, exact: true }).locator('a[href^="/post/"]')
  // 取得が終わって記録が並ぶまで待ってから数える（待たずに数えると、遅い環境では0件になる）
  await expect(links('ピックアップ')).toHaveCount(5)
  await expect(links('新着の記録').first()).toBeVisible()
  const hrefs = (name: string) => links(name)
    .evaluateAll(anchors => [...new Set(anchors.map(a => (a.getAttribute('href') ?? '').replace(/#.*/, '')))])
  const pickup = await hrefs('ピックアップ')
  const latest = await hrefs('新着の記録')
  expect(pickup).toHaveLength(5)
  expect(latest.length).toBeGreaterThan(0)
  expect(latest.filter(href => pickup.includes(href))).toEqual([])
})

test('ホームには、記録の使われ方と、規約・プライバシー・問い合わせへのリンクがある（ホームにはフッターが無い）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: '記録の使われ方・連絡先' })).toHaveAttribute('href', '/about')
  const legal = page.getByRole('navigation', { name: '規約・連絡先など' })
  await expect(legal.getByRole('link', { name: 'このサービスについて' })).toHaveAttribute('href', '/about')
  await expect(legal.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
  await expect(legal.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy')
  await expect(legal.getByRole('link', { name: 'お問合せ' })).toHaveAttribute('target', '_blank')
  // 押しやすさ: どれも高さ44px以上
  for (const link of await legal.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

// 小見出し（2026-10-20に本人が決めた案B）。サーバーは日本語で描き、起動後にブラウザの言語へ切り替わるので、言語ごとに行数が違うと下がずれる（CLS）。
// ホーム冒頭は1行のまま。/map のヘッダー（幅は画面幅−160px・11px・1行）は、途中で省略されない短い形にしてある。
const SUBTITLES = {
  ja: { hero: '水辺の外来生物を、みんなで記録する地図', header: '水辺の外来生物を記録する地図' },
  en: { hero: 'Mapping waterside invasive species together', header: 'Waterside invasive species map' },
  ko: { hero: '물가의 외래생물을 함께 기록하는 지도', header: '물가의 외래생물 기록 지도' },
  zh: { hero: '大家一起记录水边外来物种的地图', header: '水边外来物种记录地图' },
} as const
for (const [lang, text] of Object.entries(SUBTITLES)) {
  test(`小見出しは、${lang}でも、ホーム冒頭は1行・/map のヘッダーは省略されない（360px）`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await prepare(page)
    await page.addInitScript(l => localStorage.setItem('zaridasu_lang', l), lang)
    await page.goto('/')
    const eyebrow = page.locator('#main-content').getByText(text.hero, { exact: true })
    await expect(eyebrow).toBeVisible()
    expect((await eyebrow.boundingBox())!.height).toBeLessThanOrEqual(20) // 12px・行の高さ18px＝1行
    await page.goto('/map')
    const header = page.locator('header').getByText(text.header, { exact: true }).filter({ visible: true })
    await expect(header).toBeVisible()
    expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true) // 省略記号（…）になっていない
  })
}

test('バナーの1枚目は、記録する画面へ案内する（会員は投稿画面・未ログインは登録画面が開く）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  const banner = page.getByRole('region', { name: '参加・ご案内' })
  await expect(banner.getByRole('link')).toHaveAttribute('href', '/map?post=1')
  await expect(banner.getByRole('link')).toContainText('みんなで記録')
  await banner.getByRole('link').click()
  await expect(page).toHaveURL(/\/map/)
  await expect(page.getByRole('dialog')).toBeVisible() // 未ログイン：登録の小窓
})

for (const width of [390, 360, 320]) {
  test(`バナーの送りボタンは、説明用の画像の札と重ならない（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await prepare(page)
    await page.goto('/')
    const banner = page.getByRole('region', { name: '参加・ご案内' })
    const [tag, next] = await Promise.all([banner.getByText('説明用の画像').boundingBox(), banner.getByRole('button', { name: '次のバナーを見る' }).boundingBox()])
    const overlap = !(tag!.x + tag!.width <= next!.x || next!.x + next!.width <= tag!.x || tag!.y + tag!.height <= next!.y || next!.y + next!.height <= tag!.y)
    expect(overlap).toBe(false)
  })
}

test('最初に並ぶ説明用の画像（バナー・図鑑・記録ガイド）は、同じファイルを繰り返さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  // 「説明用の画像」の札が付いた画像だけを数える（記録カードの写真は、このテストでは同じファイルを借りている）
  const files = await page.locator('#main-content img[src*="images"]').evaluateAll(images => images
    .filter(img => [...(img.parentElement?.children ?? [])].some(el => el.textContent === '説明用の画像'))
    .map(img => new URL(img.getAttribute('src') ?? '', location.href).searchParams.get('url') ?? ''))
  // バナーの1枚目・図鑑の2枚・記録ガイドの記事2枚
  expect(files).toHaveLength(5)
  expect(new Set(files).size).toBe(5)
})

test('バナー切替・端末保存・ガイド・ゲスト投稿を操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  const next = page.getByRole('button', { name: '次のバナーを見る' })
  await next.click()
  await expect(page.getByRole('region', { name: '参加・ご案内' }).getByRole('link')).toHaveAttribute('href', /^https:\/\//)
  const banner = page.getByRole('region', { name: '参加・ご案内' })
  await expect(banner.getByText('2 / 3')).toBeVisible()
  await next.click(); await next.click()
  await expect(banner.getByText('1 / 3')).toBeVisible()
  const save = page.getByRole('button', { name: 'この端末に保存する', exact: true }).first()
  await save.click()
  await expect(page.getByRole('button', { name: 'この端末の保存を解除する' }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'この端末の保存を解除する' }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '保存した記録を見る（1）' }).click()
  const saved = page.getByRole('dialog', { name: 'この端末に保存した記録' })
  await expect(saved.getByRole('link', { name: /ウシガエル/ })).toHaveCount(1)
  await saved.getByRole('button', { name: 'この端末の保存を解除する' }).click()
  await expect(saved.getByText('表示できる保存済みの記録はありません。')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: /いつもの水路に/ }).click()
  await expect(page).toHaveURL(/\/guide#water/)
  await page.getByText('見るだけでも登録が必要ですか？').click()
  await expect(page.getByText('ホームや地図、公開された記録は登録せずに閲覧できます。', { exact: false })).toBeVisible()
  await page.goto('/')
  await page.getByRole('button', { name: '無料で登録して記録する' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('未ログインのヒーローから開く登録画面は、何のための登録かを先に伝え、規約への道を持つ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page)
  await page.goto('/')
  await page.getByRole('button', { name: '無料で登録して記録する' }).click()
  const dialog = page.getByRole('dialog', { name: 'ザリダス' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('記録するには、無料の登録が必要です。')).toBeVisible()
  // タブは「ログイン」と「新規登録」だけ。パスワード再設定はタブに並べない。特典は市民に関わる3つ（CSVの出力は並べない）
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await expect(dialog.getByRole('tab', { name: 'パスワード再設定' })).toHaveCount(0)
  await expect(dialog.getByText('写真と場所つきで、記録を送れる')).toBeVisible()
  await expect(dialog.getByText('自分の記録の履歴と統計を見返せる')).toBeVisible()
  await expect(dialog.getByText('記録にコメントできる')).toBeVisible()
  await expect(dialog.getByText('CSV')).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
  await expect(dialog.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy')
  expect(await dialog.locator('h2').innerText()).not.toContain('🦞')
  // 登録しても投稿画面は自動で開かない。閉じればホームのまま。
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test('会員にはヒーローを出さず、従来の本人カードを出す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'data', true)
  await page.goto('/')
  await expect(page.getByText('テスト探索者')).toBeVisible()
  await expect(page.getByRole('heading', { name: /あなたの「見つけた」が/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '無料で登録して記録する' })).toHaveCount(0)
})

test('記録が少ない時期は、空の欄を出さず、写真なしは1行にまとめ、足りない記録を数字で出す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'sparse')
  await page.goto('/')
  // いいね・質問が無い間は、人気・しつもんの欄ごと出さない（空欄の案内も出さない）
  await expect(page.getByRole('heading', { name: '人気の記録', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '新着のしつもん', exact: true })).toHaveCount(0)
  await expect(page.getByText('いいねが付いた記録はまだありません')).toHaveCount(0)
  await expect(page.getByText('最近の記録への質問はまだありません')).toHaveCount(0)
  // 保存がまだ無いので「保存した記録を見る」も出さない
  await expect(page.getByRole('button', { name: /保存した記録を見る/ })).toHaveCount(0)
  // 写真なしの記録は灰色のカードを5枚並べず、「5件」の1行にまとめる
  const posts = page.getByRole('region', { name: '新着の記録' })
  await expect(posts.getByText('写真なしの記録', { exact: true })).toHaveCount(1)
  const row = posts.getByRole('link', { name: /由利本荘市.*アメリカザリガニは見つからなかった.*5件/ })
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute('href', /\/post\/00000000-0000-0000-0000-000000000300$/)
  // ピックアップは写真が1枚でも空きマスなく出る
  const pickup = page.getByRole('region', { name: 'ピックアップ' })
  await expect(pickup.locator('[data-count="1"] a')).toHaveCount(1)
  // まだ足りない記録: 記録の数字を、見本ではなく公開記録の実数から出す
  const gaps = page.getByRole('region', { name: 'まだ足りない記録' })
  await expect(gaps.getByRole('button', { name: /ウシガエルの記録は、まだありません。/ })).toBeVisible()
  await expect(gaps.getByRole('button', { name: /「見つからなかった」の記録は、5件。/ })).toBeVisible()
  await expect(gaps.getByRole('button', { name: /記録のある市町村は、25のうち2。/ })).toBeVisible()
})

test('「まだ足りない記録」を押すと、未ログインは登録画面、会員は種類を選んだ投稿画面が開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'sparse')
  await page.goto('/')
  await page.getByRole('region', { name: 'まだ足りない記録' }).getByRole('button', { name: /ウシガエルの記録は、まだありません。/ }).click()
  await expect(page.getByRole('dialog', { name: 'ザリダス' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('会員が「見つからなかった」の記録を押すと、不在確認を選んだ投稿画面が開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'sparse', true)
  await page.goto('/')
  await page.getByRole('region', { name: 'まだ足りない記録' }).getByRole('button', { name: /「見つからなかった」の記録は、5件。/ }).click()
  await expect(page).toHaveURL(/\/map$/)
  const form = page.getByRole('dialog').filter({ hasText: '不在確認モード' })
  await expect(form).toBeVisible()
  await expect(form.getByRole('button', { pressed: true, name: /アメリカザリガニ/ })).toBeVisible()
})

test('会員がウシガエルの記録を押すと、ウシガエルを選んだ投稿画面が開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'sparse', true)
  await page.goto('/')
  await page.getByRole('region', { name: 'まだ足りない記録' }).getByRole('button', { name: /ウシガエルの記録は、まだありません。/ }).click()
  await expect(page).toHaveURL(/\/map$/)
  await expect(page.getByRole('button', { pressed: true, name: /ウシガエル/ })).toBeVisible()
})

test('取得失敗と空の記録を区別し、再試行で実データへ復帰する', async ({ page }) => {
  await prepare(page, 'error')
  await page.goto('/')
  await expect(page.getByText('記録を読み込めませんでした。通信状況を確認して再試行してください。').first()).toBeVisible()
  await page.getByRole('button', { name: '再試行', exact: true }).first().click()
  await expect(page.getByText('どの角度から撮ればよいですか？')).toBeVisible()
})

test('空の投稿には架空の投稿・数値を表示しない', async ({ page }) => {
  await prepare(page, 'empty')
  await page.goto('/')
  await expect(page.getByText('公開された記録はまだありません。最初の発見を残してみませんか。')).toBeVisible()
  await expect(page.getByText('みずべさん')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'この端末に保存する' })).toHaveCount(0)
})

test('会員の承認済み進捗とバッジを表示し、フォーカスを閉じ込めて戻す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, 'data', true)
  await page.goto('/')
  await expect(page.getByText('テスト探索者')).toBeVisible()
  await expect(page.getByText('総合 90 XP')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
  const badges = page.getByRole('button', { name: '自分のバッジを見る' })
  await badges.click()
  const dialog = page.getByRole('dialog', { name: '自分のバッジを見る' })
  await expect(dialog.getByText('獲得済み')).toHaveCount(2)
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(badges).toBeFocused()
})

test('会員の集計取得失敗をゼロ扱いせず、まとめて再試行できる', async ({ page }) => {
  await prepare(page, 'data', true)
  let failed = true
  await page.route(`${api}/rest/v1/rpc/get_user_progress**`, route => {
    return failed
      ? route.fulfill({ status: 500, json: { message: 'Synthetic progress failure' } })
      : route.fulfill({ json: [{ xp: 90, level: 2, xp_into_level: 40, xp_for_next_level: 100, approved_count: 5 }] })
  })
  await page.goto('/')
  await expect(page.getByText('— XP')).toBeVisible()
  await expect(page.getByRole('button', { name: '自分のバッジを見る' })).toBeDisabled()
  failed = false
  await page.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(page.getByText('総合 90 XP')).toBeVisible()
  await expect(page.getByRole('button', { name: '自分のバッジを見る' })).toBeEnabled()
})

for (const scenario of [{ lang: 'en', theme: 'dark', width: 320 }, { lang: 'zh', theme: 'light', width: 768 }, { lang: 'ko', theme: 'dark', width: 1440 }]) {
  test(`ホームの${scenario.lang}/${scenario.theme}/${scenario.width}px表示`, async ({ page }, testInfo) => {
    await prepare(page)
    await page.addInitScript(({ lang, theme }) => {
      localStorage.setItem('zaridasu_lang', lang)
      localStorage.setItem('theme', theme)
    }, scenario)
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', scenario.lang)
    await expect(page.getByRole('region').filter({ has: page.getByRole('heading', { level: 2 }) }).first()).toBeVisible()
    await expect(page.locator('.loading-screen')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('body').innerText()).not.toContain('homeHub.')
    await page.screenshot({ path: testInfo.outputPath('home-locale.png') })
  })
}
