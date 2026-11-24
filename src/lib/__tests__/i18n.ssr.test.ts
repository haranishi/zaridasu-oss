// @vitest-environment node
import { expect, it } from 'vitest'
import i18n, { restoreClientLanguage } from '../i18n'

it('SSRは同期JAで初期化し、browser言語や別辞書を読み込まない', async () => {
  expect(typeof window).toBe('undefined')
  expect(i18n.isInitialized).toBe(true)
  expect(i18n.language).toBe('ja')
  expect(i18n.t('common.close')).toBe('閉じる')
  await restoreClientLanguage()
  expect(i18n.language).toBe('ja')
  for (const language of ['en', 'zh', 'ko']) {
    expect(i18n.hasResourceBundle(language, 'translation')).toBe(false)
  }
})
