import { test, expect, type Page } from '@playwright/test'

async function openGuideFromMenu(page: Page) {
  // 本番SSRでは、ストリーミング用の非表示Headerが一時的に併存する。
  // hydration完了を待ってから、実際のメニューを操作する。
  const menu = page.getByTestId('header-menu').filter({ visible: true })
  await expect(menu).toHaveCount(1)
  await menu.click()
  await page.getByTestId('drawer-intro').click()
}

async function waitForPromptAnimation(page: Page) {
  const prompt = page.getByTestId('intro-prompt')
  await expect(prompt).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => prompt.evaluate(element => {
    const wrapper = element.parentElement!
    return wrapper.classList.contains('translate-y-0') && wrapper.getAnimations().every(animation => animation.playState !== 'running')
  })).toBe(true)
}

test.beforeEach(async ({ page }) => {
  // ネットワーク状態に依存せず、案内と地図への引き継ぎだけを検証する。
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
  await page.addInitScript(() => {
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
  })
})

test('REQ-328: 小画面の案内を閉じるボタンが写真タブに遮られない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => {
    localStorage.removeItem('zaridasu_intro_optout_v1')
    localStorage.setItem('zaridasu_lang', 'en')
    localStorage.setItem('theme', 'dark')
  })
  await page.goto('/map')
  const close = page.getByTestId('intro-prompt-later')
  await waitForPromptAnimation(page)
  await expect.poll(() => close.evaluate(button => {
    const rect = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  })).toBe(true)
  await close.click()
  await expect(page.getByTestId('intro-prompt')).toHaveCount(0)
  const photos = page.getByRole('button', { name: 'Photos — Open photo gallery', exact: true })
  await photos.click()
  await expect(photos).toHaveCount(0)
})

test('REQ-328: 案内の透明な余白はデスクトップの地図操作を遮らない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 844 })
  await page.addInitScript(() => {
    localStorage.removeItem('zaridasu_intro_optout_v1')
    localStorage.setItem('zaridasu_lang', 'en')
  })
  await page.goto('/map')
  await waitForPromptAnimation(page)
  // 実際の位置情報を要求せず、クリックを遮る要素がないことを判定する。
  const locate = page.getByRole('button', { name: 'Show my location', exact: true })
  await expect.poll(() => locate.evaluate(button => {
    const rect = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  })).toBe(true)
  await locate.click({ trial: true, timeout: 5000 })
  await expect(page.getByTestId('intro-prompt')).toBeVisible()
})

for (const complete of [false, true]) {
  test(`REQ-328: 別ページの任意案内から地図へ移動する（回答${complete ? '完了' : '前'}）`, async ({ page }) => {
    await page.goto('/trends')
    await openGuideFromMenu(page)
    if (complete) {
      await page.getByTestId('onboarding-option-north').click()
      await page.getByTestId('onboarding-continue').click()
      await page.getByTestId('onboarding-option-no').click()
      await page.getByTestId('onboarding-continue').click()
      await page.getByTestId('onboarding-continue').click()
    }
    await page.getByTestId('onboarding-map-only').click()
    await expect(page).toHaveURL('/map')
    await expect(page.getByTestId('onboarding')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('zaridasu_onboarding_region_v1'))).toBe(complete ? 'north' : null)
  })
}

test('REQ-328: 別ページの任意案内から投稿開始を引き継ぐ', async ({ page }) => {
  await page.goto('/trends')
  await openGuideFromMenu(page)
  await page.getByTestId('onboarding-option-central').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-option-maybe').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-post').click()
  await expect(page).toHaveURL('/map')
  await expect(page.getByTestId('onboarding')).toHaveCount(0)
  // 未ログインでは投稿より先にログイン案内が出る。ホーム表示だけで終わらない。
  await expect(page.getByRole('dialog').filter({ hasText: 'ザリダス' })).toBeVisible()
})

test('REQ-328: 戻って回答を選び直し、選んだ地域を地図へ引き継ぐ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await openGuideFromMenu(page)
  const dialog = page.getByTestId('onboarding')
  const heading = dialog.getByRole('heading', { level: 2 })
  await expect(heading).toBeFocused()
  await expect(page.getByTestId('onboarding-continue')).toBeDisabled()
  await page.getByTestId('onboarding-option-north').click()
  await page.getByTestId('onboarding-continue').click()
  await expect(heading).toBeFocused()
  await page.getByTestId('onboarding-option-yes').click()
  await page.getByTestId('onboarding-back').click()
  await expect(page.getByTestId('onboarding-option-north')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('onboarding-option-south').click()
  await page.getByTestId('onboarding-continue').click()
  await expect(page.getByTestId('onboarding-option-yes')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('onboarding-option-no').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-continue').click()
  await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', '4')
  await page.getByTestId('onboarding-back').click()
  await page.getByTestId('onboarding-back').click()
  await expect(page.getByTestId('onboarding-option-no')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-map-only').click()
  await expect(dialog).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('zaridasu_onboarding_region_v1'))).toBe('south')
})

for (const scenario of [
  { lang: 'ja', theme: 'light', width: 390, height: 844 },
  { lang: 'en', theme: 'dark', width: 320, height: 568 },
  { lang: 'zh', theme: 'light', width: 768, height: 1024 },
  { lang: 'ko', theme: 'dark', width: 1440, height: 900 },
]) {
  test(`REQ-328: ${scenario.lang}/${scenario.theme}/${scenario.width}pxで操作とフォーカスを保つ`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.addInitScript(({ lang, theme }) => {
      localStorage.setItem('zaridasu_lang', lang)
      localStorage.setItem('theme', theme)
    }, scenario)
    await page.goto('/')
    await openGuideFromMenu(page)
    const dialog = page.getByTestId('onboarding')
    for (let step = 1; step <= 4; step++) {
      await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(step))
      await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const action = page.getByTestId(step < 4 ? 'onboarding-continue' : 'onboarding-map-only')
      await expect(action).toBeInViewport({ ratio: 1 })
      // 見出しからの逆方向移動も含め、モーダルの外へフォーカスが漏れない。
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
      await page.getByTestId('onboarding-close').focus()
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
      if (step === 1) await page.getByTestId('onboarding-option-central').click()
      if (step === 2) await page.getByTestId('onboarding-option-maybe').click()
      if (step < 4) await action.click()
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
}
