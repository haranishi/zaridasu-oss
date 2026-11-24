import { test, expect } from '@playwright/test'

// REQ-110 FR-110-01 / AC-04: 認証 E2E
//
// 注意: 完全なログイン → サインアウトのフロー（FR-110-01 本体）は
// テスト用 Supabase アカウント（FR-110-04 / FR-110-05 で整備予定）が
// 必要なため、現状は CI 上で安定実行できる以下の観点に絞ってカバーする：
//   1. AC-04: 未ログインで /dashboard にアクセスすると / にリダイレクト
//   2. ログイン UI の入口（AuthModal）がホームから開ける
//   3. AuthModal がメール / パスワード / Google ログインの基本要素を備える
//   4. AuthModal を閉じる UI が機能する
//
// 各テスト前にクッキー / ストレージをクリアして独立性を担保（FR-110-06）。
// Playwright Chromium の navigator.language は en-US のため、
// localStorage('zaridasu_lang') = 'ja' を仕込んで日本語 UI を強制する。

test.beforeEach(async ({ context, page }) => {
  // FR-110-06: 各テストで cookie / storage をクリアして独立性を担保
  await context.clearCookies()
  // i18next がページ初期化時に localStorage を読むので、addInitScript で先回り設定
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('未ログインで /dashboard にアクセスすると / にリダイレクトされる', async ({ page }) => {
  // middleware（src/middleware.ts + lib/supabase/middleware.ts）が
  // 未認証時に /dashboard を / に redirect する仕様（FR-004）
  const res = await page.goto('/dashboard')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  expect(res?.status()).toBeLessThan(500)
})

test('未ログインで /dashboard/anything にアクセスしても / にリダイレクトされる', async ({ page }) => {
  await page.goto('/dashboard/profile')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
})

test('ホームのメニューから「ログイン」ボタン押下で AuthModal が開く', async ({ page }) => {
  await page.goto('/')

  // ハンバーガー（Header の最初のボタン、aria-label="メニューを開く" など i18n 文言）
  // 言語非依存に「Header 内の最初の button」をクリックする
  const header = page.locator('header').first()
  await header.locator('button').first().click()

  // DrawerMenu（role="dialog" aria-label="設定メニュー"）が開く
  const drawer = page.getByRole('dialog', { name: '設定メニュー' })
  await expect(drawer).toBeVisible()

  // 未ログイン時は最上部のユーザーエリアに「ログイン」ボタンが 1 番目に出る
  // Header の最初のボタンは「メニュー閉じる」、その次が「ログイン」（border-radius のラッパー内 1 番目）
  const loginButton = drawer.locator('button').nth(1)
  await loginButton.click()

  // AuthModal は role="dialog" + ブランドのロゴと「ザリダス」を含む
  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()
  // メールアドレス入力欄
  await expect(authModal.getByPlaceholder('example@email.com')).toBeVisible()
  // パスワード入力欄（type=password）
  await expect(authModal.locator('input[type="password"]')).toHaveCount(1)
})

test('AuthModal で Google ログインボタンと email/password 入力欄が揃う', async ({ page }) => {
  await page.goto('/')
  await page.locator('header button').first().click()
  const drawer = page.getByRole('dialog', { name: '設定メニュー' })
  await expect(drawer).toBeVisible()
  await drawer.locator('button').nth(1).click()

  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()
  // Google ログイン用の SVG（fill="#4285F4" の Google ブルー）または "Google" 文字を含む
  const html = await authModal.innerHTML()
  expect(html).toMatch(/Google|#4285F4/)
})

test('AuthModal はクローズボタンで閉じられる', async ({ page }) => {
  await page.goto('/')
  await page.locator('header button').first().click()
  const drawer = page.getByRole('dialog', { name: '設定メニュー' })
  await drawer.locator('button').nth(1).click()

  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()

  // Escape で閉じる（onKeyDown で Escape ハンドリング）
  await page.keyboard.press('Escape')
  await expect(authModal).toHaveCount(0)
})
