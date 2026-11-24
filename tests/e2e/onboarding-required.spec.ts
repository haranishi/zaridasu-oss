import { test, expect } from '@playwright/test'

test('REQ-328: 必須案内の地図保存が失敗しても、選んだ行動のまま再試行できる', async ({ page }) => {
  // 実アカウントを使わずクライアント表示とREST失敗を再現する。
  // サーバーの認可や実DB書き込みを検証するfixtureではない。
  const user = {
    id: '00000000-0000-0000-0000-000000000099', aud: 'authenticated', role: 'authenticated',
    email: 'onboarding@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(),
  }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + 86400
  const session = {
    access_token: [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt }), 'signature'].join('.'),
    token_type: 'bearer', expires_in: 86400, expires_at: expiresAt, refresh_token: 'e2e-fake-refresh-token', user,
  }
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co').hostname.split('.')[0]
  await page.addInitScript(({ name, value }) => {
    document.cookie = `${name}=${value}; path=/; SameSite=Lax`
    localStorage.setItem('zaridasu_lang', 'ja')
    localStorage.setItem('zaridasu_intro_optout_v1', '1')
  }, { name: `sb-${ref}-auth-token`, value: `base64-${encode(session)}` })
  await page.route('**/auth/v1/user**', route => route.fulfill({ json: user }))
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
  let releaseFirstSave!: () => void
  const firstSave = new Promise<void>(resolve => { releaseFirstSave = resolve })
  const savedAnswers: unknown[] = []
  await page.route('**/rest/v1/user_onboarding**', async route => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ json: savedAnswers.length > 1 ? { region: 'central' } : [] })
      return
    }
    savedAnswers.push(route.request().postDataJSON())
    if (savedAnswers.length === 1) {
      await firstSave
      await route.fulfill({ status: 500, json: { message: 'Simulated save failure' } })
    } else await route.fulfill({ status: 201, json: {} })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const dialog = page.getByTestId('onboarding')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('onboarding-close')).toHaveCount(0)
  await expect(page.getByTestId('onboarding-skip')).toHaveCount(0)
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.getByTestId('onboarding-option-central').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-option-maybe').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-continue').click()
  const map = page.getByTestId('onboarding-map-only')
  await map.click()
  await expect(map).toHaveText('保存中…')
  await expect(page.getByTestId('onboarding-back')).toBeDisabled()
  await expect(page.getByTestId('onboarding-post')).toBeDisabled()
  await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  releaseFirstSave()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(map).toHaveText('もう一度')
  await expect(page.getByTestId('onboarding-post')).not.toHaveText('もう一度')
  await map.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(savedAnswers).toEqual([
    { user_id: user.id, region: 'central', seen_crayfish: 'maybe' },
    { user_id: user.id, region: 'central', seen_crayfish: 'maybe' },
  ])
  expect(await page.evaluate(() => sessionStorage.getItem('zaridasu_onboarding_post_v1'))).toBeNull()
})
