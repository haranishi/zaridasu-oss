// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../../..')
const html = readFileSync(resolve(projectRoot, 'public/offline.html'), 'utf8')

describe('offline.html — REQ-293 locale parity', () => {
  it.each(['ja', 'en', 'ko', 'zh'])('%s の offline.* 実文言をすべて含む', (locale) => {
    const translation = JSON.parse(
      readFileSync(
        resolve(projectRoot, `src/locales/${locale}/translation.json`),
        'utf8',
      ),
    ) as {
      offline: Record<string, string>
    }

    expect(Object.keys(translation.offline)).toEqual([
      'title',
      'body1',
      'body2',
      'reconnect',
      'backToTop',
    ])
    for (const value of Object.values(translation.offline)) {
      expect(html).toContain(value)
    }
  })

  it('言語・titleを実行時に切り替え、既定の日本語を静的HTMLにも残す', () => {
    expect(html).toContain('document.documentElement.lang = language')
    expect(html).toContain('document.title = message.title')
    expect(html).toContain('<html lang="ja">')
    expect(html).toContain('<h1 id="offline-title">オフラインです</h1>')
    expect(html).toContain('check-i18n-parity の検査対象外')
  })
})
