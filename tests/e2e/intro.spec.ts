import { test, expect } from '@playwright/test'

// REQ-284 (AC-14): 紹介ストーリーの主要導線 E2E。
//   1. 初回 → 5秒後に誘い表示 → 読む → 最後まで送って閉じる → リロードで出ない
//   2. ［今後表示しない］→ リロードで出ない
//   3. opt-out 済みでも DrawerMenu「ザリダスってなに？」から開ける（AC-05）
//
// 既存 e2e（lp.spec.ts:13-18）に倣い、cookie をクリアし localStorage('zaridasu_lang')='ja' を
// 先回り設定する。文言は別途 i18n で追加されるため、判定は data-testid で行い翻訳に依存させない。

/** FR-284-03: 誘いポップアップはページ表示から 5 秒後。ビルド差を吸収して余裕を取る。 */
const PROMPT_TIMEOUT = 20_000
/** 「出ないこと」の確認は 5 秒の出現遅延を確実に超えてから行う。 */
const NOT_SHOWN_WAIT = 9_000

const INTRO_OPTOUT_KEY = 'zaridasu_intro_optout_v1'
const INTRO_READ_AT_KEY = 'zaridasu_intro_read_at'

// addInitScript は **リロードを含む全ナビゲーション**で走るため、ここで intro 系キーを
// 消してはいけない（消すと「リロードしても出ない」の検証が成立しない）。
// 各テストは新しいブラウザコンテキスト＝空の localStorage で始まるので、初期化は言語だけでよい。
test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('AC-01/04/14: 初回は誘いが出て、読み切って閉じるとリロード後は出ない', async ({ page }) => {
  await page.goto('/map')

  const prompt = page.getByTestId('intro-prompt')
  await expect(prompt).toBeVisible({ timeout: PROMPT_TIMEOUT })

  // ［読んでみる］でストーリー本体が開く
  await page.getByTestId('intro-prompt-read').click()
  const story = page.getByTestId('onboarding')
  await expect(story).toBeVisible({ timeout: 15_000 })
  await expect(prompt).toHaveCount(0)

  // FR-284-14 / AC-06: ストーリー表示中はバナーが出ない
  await expect(page.getByTestId('signup-banner-never')).toHaveCount(0)

  await expect(page.getByTestId('onboarding-continue')).toBeDisabled()
  await page.getByTestId('onboarding-option-north').click()
  await page.getByTestId('onboarding-continue').click()
  await expect(page.getByTestId('onboarding-continue')).toBeDisabled()
  await page.getByTestId('onboarding-option-yes').click()
  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-continue').click()
  await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', '4')
  await page.getByTestId('onboarding-map-only').click()
  expect(await page.evaluate(() => localStorage.getItem('zaridasu_onboarding_region_v1'))).toBe('north')
  await expect(story).toHaveCount(0)
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), INTRO_READ_AT_KEY))
    .not.toBeNull()

  // リロードしても誘いは出ない
  await page.reload()
  await page.waitForTimeout(NOT_SHOWN_WAIT)
  await expect(page.getByTestId('intro-prompt')).toHaveCount(0)
})

test('AC-02/14: ［今後表示しない］を押すとリロードしても出ない', async ({ page }) => {
  await page.goto('/map')

  await expect(page.getByTestId('intro-prompt')).toBeVisible({ timeout: PROMPT_TIMEOUT })
  await page.getByTestId('intro-prompt-never').click()
  await expect(page.getByTestId('intro-prompt')).toHaveCount(0)

  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), INTRO_OPTOUT_KEY))
    .toBe('1')

  await page.reload()
  await page.waitForTimeout(NOT_SHOWN_WAIT)
  await expect(page.getByTestId('intro-prompt')).toHaveCount(0)
})

test('AC-05: opt-out 済みでもメニューからストーリーを開ける', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_intro_optout_v1', '1') } catch { /* noop */ }
  })
  await page.goto('/map')

  // 誘いは出ない
  await page.waitForTimeout(NOT_SHOWN_WAIT)
  await expect(page.getByTestId('intro-prompt')).toHaveCount(0)

  // ハンバーガー → 「ザリダスってなに？」
  await page.getByTestId('header-menu').click()
  await page.getByTestId('drawer-intro').click()

  await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', '1')
})

// 必須モードは auth.spec.ts 冒頭のとおりログインfixtureが無いためunitで検証する。
for (const target of [1, 2, 3, 4]) {
  test(`AC-02: 任意モードは画面${target}の×で閉じられる`, async ({ page }) => {
    await page.goto('/map')
    await page.getByTestId('intro-prompt-read').click({ timeout: PROMPT_TIMEOUT })
    for (let step = 1; step < target; step++) {
      if (step === 1) await page.getByTestId('onboarding-option-other').click()
      if (step === 2) await page.getByTestId('onboarding-option-maybe').click()
      await page.getByTestId('onboarding-continue').click()
    }
    await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(target))
    await page.getByTestId('onboarding-close').click()
    await expect(page.getByTestId('onboarding')).toHaveCount(0)
  })
}
