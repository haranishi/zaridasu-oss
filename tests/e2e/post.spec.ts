import { test, expect } from '@playwright/test'

// REQ-110 FR-110-02 / AC-05: 投稿フロー E2E
//
// 注意: PostForm の送信成功までの完全フロー（写真添付 → 種別選択 → 位置選択 → 送信 → 詳細遷移）は
// 認証済セッション + 書き込み可能な Supabase テスト DB（FR-110-04 / 05）が必要なため、
// 現時点では認証ゲート部分と未ログイン時の UI 分岐を中心にカバーする：
//   1. ボトムナビの「投稿」ボタン（未ログイン）押下で AuthModal（signup タブ）が開く
//   2. ボトムナビが描画されている
//   3. 「マイページ」タブ未ログイン押下で AuthModal（login）が開く
//   4. AuthModal を閉じてもホーム要素が残る

test.beforeEach(async ({ context, page }) => {
  // FR-110-06: 独立性担保
  await context.clearCookies()
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('未ログインでホームの「投稿」ボタンを押すと AuthModal が開く', async ({ page }) => {
  await page.goto('/')

  // 投稿ボタン（aria-label="投稿する"）。1280px ではサイドナビ側が可視。
  const postButton = page.getByRole('button', { name: '投稿する' }).first()
  await expect(postButton).toBeVisible()
  await postButton.click()

  // 未ログインなら AuthModal（signup タブ）が開く（HomeInteractive: handleTap → onLoginClick('signup')）
  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()
  // signup タブには password と passwordConfirm の 2 つの input[type=password] が出る
  await expect(authModal.locator('input[type="password"]')).toHaveCount(2)
})

// REQ-323 FR-323-01 / AC-04: ナビは 1024px を境に「ヘッダー水平ナビ」と「ボトムタブ」で
// 入れ替わる。既定のビューポート（Desktop Chrome = 1280px）では **ボトムタブは出ない**のが
// 正しい状態なので、両方の幅で「そのとき出ているべきナビ」に 5 項目が揃うことを見る。
// 旧テストは `page.locator('nav').last()` で最後の nav を掴んでいたが、非表示の nav も
// CSS ロケータには引っかかるため、可視の nav を明示して取る。
test('主要タブが表示される（1280px=サイドナビ / 390px=ボトムナビ）', async ({ page }) => {
  await page.goto('/')

  // ── デスクトップ（既定 1280px）: ヘッダー水平ナビ・ボトムタブは存在しない
  await expect(page.getByRole('button', { name: '投稿する' }).first()).toBeVisible()
  const headerNav = page.getByRole('navigation', { name: 'メインナビゲーション' })
  await expect(headerNav).toBeVisible()
  // タブラベルは i18n に依存しない日本語固定（BottomNav.tsx の NAV_TABS 定義）
  for (const label of ['ホーム', '地図', '図鑑', 'マイページ']) {
    await expect(headerNav.getByText(label, { exact: true })).toBeVisible()
  }
  // 1024px 以上ではボトムタブが画面に無い（浮いた島を残さない）
  // React 19 のストリーミング配信では、Suspense 境界の中身が現れるまでの数百 ms、
  // 同じ nav が `<div hidden id="S:n">` の中にもう 1 つ居る（CSS ロケータは hidden も拾う）。
  // 複製が消えて 1 つになるのを待ってから strict な toBeHidden を掛ける。
  const bottomNav = page.locator('nav.fixed.bottom-0')
  await expect(bottomNav).toHaveCount(1)
  await expect(bottomNav).toBeHidden()

  // ── モバイル（390px）: 従来どおりボトムナビ
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(bottomNav).toBeVisible()
  for (const label of ['ホーム', '地図', '図鑑', 'マイページ']) {
    await expect(bottomNav.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(headerNav).toBeHidden()
})

test('未ログインでマイページタブを押すと AuthModal（login）が開く', async ({ page }) => {
  await page.goto('/')
  // 未ログインなら 'mypage' タップで onLoginClick('login')（ヘッダー水平ナビ・ボトムナビ共通）
  const nav = page.getByRole('navigation', { name: 'メインナビゲーション' })
  await nav.getByText('マイページ', { exact: true }).click()

  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()
  // login タブには password 1 つのみ（confirm 無し）
  await expect(authModal.locator('input[type="password"]')).toHaveCount(1)
})

test('AuthModal を閉じてもホームのナビが残る', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '投稿する' }).first().click()
  const authModal = page.getByRole('dialog').filter({ hasText: 'ザリダス' })
  await expect(authModal).toBeVisible()

  // Escape で閉じる
  await page.keyboard.press('Escape')
  await expect(authModal).toHaveCount(0)

  // ナビは依然として残っている
  await expect(page.getByRole('button', { name: '投稿する' }).first()).toBeVisible()
})
