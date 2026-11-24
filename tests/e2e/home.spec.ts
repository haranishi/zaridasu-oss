import { test, expect } from '@playwright/test'

// REQ-051 INV-01: ホーム表示とヘッダー要素の存在確認（スモーク）
test('ホームページが日本語タイトルで描画される', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(500)
  await expect(page).toHaveTitle(/ザリダス/)
  // body 内に日本語コンテンツが存在すれば描画成功
  const body = await page.locator('body').textContent()
  expect(body ?? '').toMatch(/ザリ|秋田|外来/)
})

test('トレンドページに遷移できる', async ({ page }) => {
  const res = await page.goto('/trends')
  await expect(page).toHaveURL(/\/trends/)
  expect(res?.status()).toBeLessThan(500)
})
