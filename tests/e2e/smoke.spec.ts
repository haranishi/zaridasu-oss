import { test, expect } from '@playwright/test'

// 他 spec（auth/lp/home/survey-request）に倣い、各テスト前に cookie をクリアし
// localStorage('zaridasu_lang')='ja' を先回り設定して日本語 UI を強制する。
// （Playwright Chromium の navigator.language は en-US のため、これを入れないと
//  ブランド名が "Zaridasu" でレンダリングされ、日本語前提のアサーションが落ちる）
test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('E2E はザリダス本体を対象にしている', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(500)
  await expect(page).toHaveTitle(/ザリダス/)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#dc2626')
  // ブランド名はヘッダー中央のタイトル（REQ-225 で BrandMark 併記の <span> として描画。
  // heading ロールは持たない）。home.spec.ts と同じく本文テキストで本体（ザリダス）を確認する。
  const body = await page.locator('body').textContent()
  expect(body ?? '').toContain('ザリダス')
})
