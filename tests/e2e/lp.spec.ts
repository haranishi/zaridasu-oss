import { test, expect } from '@playwright/test'

// REQ-206 (FR-206-06): マーケティング LP（/lp）の主要導線 E2E。
//   1. /lp が 5xx なく描画され、h1 キャッチコピー・主要セクションが見える
//   2. 主CTA → /?auth=signup&from=lp（FR-176-08 着地クエリ）
//   3. 主CTA クリック → / に遷移し AuthModal が signup で自動表示・クエリ除去（SC-176-02）
//   4. 副CTA → /map（地図閲覧）
//   5. FAQ アコーディオンが aria-expanded で開閉する
//
// 既存 e2e（auth/home）に倣い、各テスト前に cookie をクリアし、
// localStorage('zaridasu_lang')='ja' を先回り設定して日本語 UI を強制する。

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('/lp が描画され、キャッチコピーと主要セクションが見える', async ({ page }) => {
  const res = await page.goto('/lp')
  expect(res?.status()).toBeLessThan(500)

  // h1 はキャッチコピー1つ（NFR-176-07）
  const h1 = page.locator('h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toContainText('見つけた')

  // 本文に LP らしい日本語が含まれる
  const body = await page.locator('body').textContent()
  expect(body ?? '').toMatch(/秋田|無料|参加/)
})

test('ヒーロー画像が描画される（FR-206-01）', async ({ page }) => {
  await page.goto('/lp')
  const heroImg = page.getByRole('img', { name: /地図/ }).first()
  await expect(heroImg).toBeVisible()
})

test('主CTAは /?auth=signup&from=lp を指す（FR-176-08）', async ({ page }) => {
  await page.goto('/lp')
  // ヒーローの主CTA（最初に出てくる「無料で参加する」リンク）
  const primary = page.getByRole('link', { name: /無料で参加する/ }).first()
  await expect(primary).toHaveAttribute('href', '/?auth=signup&from=lp')
})

test('副CTAは / を指す（地図閲覧・FR-176-09）', async ({ page }) => {
  await page.goto('/lp')
  const secondary = page.getByRole('link', { name: /登録せずに地図を見る/ }).first()
  await expect(secondary).toHaveAttribute('href', '/map')
})

test('主CTAクリック → / で AuthModal(signup) が自動表示されクエリが除去される', async ({ page }) => {
  await page.goto('/lp')
  await page.getByRole('link', { name: /無料で参加する/ }).first().click()

  // ルートへ遷移（pathname=/）
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')

  // AuthModal（role=dialog・「ザリダス」を含む）が自動表示される
  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible({ timeout: 15_000 })

  // FR-176-08: 自動オープン後、auth/from クエリは URL から除去される
  await expect.poll(() => new URL(page.url()).search).toBe('')
})

test('副CTAクリックで / の地図アプリへ遷移する', async ({ page }) => {
  await page.goto('/lp')
  await page.getByRole('link', { name: /登録せずに地図を見る/ }).first().click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/map')
  // 地図アプリのタイトル（ザリダス）に着地
  await expect(page).toHaveTitle(/ザリダス/)
})

test('FAQ アコーディオンが aria-expanded で開閉する', async ({ page }) => {
  await page.goto('/lp')
  // FAQ セクションの最初の質問ボタン（aria-controls=lp-faq-answer-1）
  const q1 = page.locator('button[aria-controls="lp-faq-answer-1"]')
  // React 19 のストリーミング配信では、Suspense 境界の中身が現れるまでの数百 ms、
  // 同じボタンが `<div hidden id="S:n">` の中にもう 1 つ居る（CSS ロケータは hidden も拾う）。
  // 複製が消えて 1 つになり、見えるようになってから操作する。
  await expect(q1).toHaveCount(1)
  await expect(q1).toBeVisible()
  await q1.scrollIntoViewIfNeeded()
  await expect(q1).toHaveAttribute('aria-expanded', 'false')

  await q1.click()
  await expect(q1).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#lp-faq-answer-1')).toBeVisible()

  await q1.click()
  await expect(q1).toHaveAttribute('aria-expanded', 'false')
})

test('フッターに /about /terms /privacy リンクがある', async ({ page }) => {
  await page.goto('/lp')
  const footer = page.locator('footer')
  await expect(footer.locator('a[href="/about"]')).toHaveCount(1)
  await expect(footer.locator('a[href="/terms"]')).toHaveCount(1)
  await expect(footer.locator('a[href="/privacy"]')).toHaveCount(1)
})
