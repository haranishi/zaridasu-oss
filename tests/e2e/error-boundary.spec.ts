import { test, expect } from '@playwright/test'

// REQ-051 INV-04 / REQ-267 FR-267-02: 存在しないルートで not-found.tsx が日本語表示される。
// アサーションは NotFoundPage.tsx の実文言（日本語見出し）をロケータの自動待機で肯定確認する。
// page.content() の即時取得は SW 初回インストールのリロード等とレースするため使わない。
test('存在しない URL で 404 ページが日本語で表示される', async ({ page }) => {
  const res = await page.goto('/__does_not_exist__')
  expect(res?.status()).toBe(404)
  // NotFoundPage の日本語見出し。ロケータの自動待機がナビゲーション中の一時的失敗を吸収する。
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'トップに戻る' })).toBeVisible()
})
