import { test, expect } from '@playwright/test'

// REQ-051 INV-02: 未ログインで /admin/* に到達すると /admin/login にリダイレクトされる
test('未認証で /admin/posts を開くと /admin/login にリダイレクト', async ({ page }) => {
  const res = await page.goto('/admin/posts')
  // middleware は 307 redirect を返す
  await expect(page).toHaveURL(/\/admin\/login$/)
  expect(res?.status()).toBeLessThan(500)
})

test('未認証で /admin/users を開くと /admin/login にリダイレクト', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('/admin/login は認証不要で開ける', async ({ page }) => {
  const res = await page.goto('/admin/login', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin\/login$/)
  expect(res?.status()).toBeLessThan(400)
})
