import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render } from '@testing-library/react'
import AboutPage from '@/views/AboutPage'

// REQ-284 の文言レイヤーを守るためのテスト。
//   - FR-284-11: `/about` の各セクションに #how-to-use / #species / #law がある
//   - FR-284-23: 環境省リンクが 404 だった旧 URL を指していない
//   - FR-284-21: 条件付特定外来生物（アメリカザリガニ）を「飼育禁止」と書いていない
//   - FR-284-26: 罰則の具体的な金額・拘禁年数を書いていない
//   - FR-284-27: 終了済みの「相談ダイヤル」に言及していない
//   - NFR-284-03 / AC-12: intro.* が 4 言語そろっており、禁止語を含まない

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))

vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}))

const LANGS = ['ja', 'en', 'zh', 'ko'] as const

type Dict = Record<string, unknown>

function loadLocale(lang: string): Dict {
  const file = path.join(process.cwd(), 'src', 'locales', lang, 'translation.json')
  return JSON.parse(readFileSync(file, 'utf8')) as Dict
}

function get(dict: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Dict)[key]
    return undefined
  }, dict)
}

/** dict 配下のすべての文字列を [キー, 値] で列挙する。 */
function entries(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Dict).flatMap(([k, v]) =>
    entries(v, prefix ? `${prefix}.${k}` : k),
  )
}

const LOCALES = Object.fromEntries(LANGS.map((l) => [l, loadLocale(l)])) as Record<
  (typeof LANGS)[number],
  Dict
>

// ── /about の描画 ────────────────────────────────────────────────────────
describe('AboutPage', () => {
  it('FR-284-11: モーダルから飛べるよう各セクションに id が付いている', () => {
    const { container } = render(<AboutPage />)
    for (const id of ['how-to-use', 'species', 'law']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('FR-284-23: 404 だった旧 env.go.jp URL を参照していない', () => {
    const { container } = render(<AboutPage />)
    const hrefs = [...container.querySelectorAll('a[href^="https://www.env.go.jp"]')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('https://www.env.go.jp/nature/intro/2outline/regulation/jokentsuki.html')
    expect(hrefs).not.toContain('https://www.env.go.jp/nature/intro/4toriatsukai/zarigani.html')
    expect(hrefs).not.toContain('https://www.env.go.jp/nature/intro/2outline/attention/usigaeru.html')
    // 外部リンクは新規タブ + rel を維持する
    for (const a of container.querySelectorAll('a[href^="https://www.env.go.jp"]')) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })
})

// ── 法令表記の是正（4言語） ───────────────────────────────────────────────
describe('法令表記（REQ-284 §7）', () => {
  it.each(LANGS)('FR-284-21: %s で「一般家庭での飼育は可能」を明示している', (lang) => {
    expect(typeof get(LOCALES[lang], 'about.law_info.american.allowed')).toBe('string')
    expect(get(LOCALES[lang], 'about.law_info.american.allowed')).not.toBe('')
  })

  it('FR-284-21(ja): アメリカザリガニを「飼育禁止・運搬禁止」と書いていない', () => {
    const texts = [
      get(LOCALES.ja, 'about.law_info.american.desc'),
      get(LOCALES.ja, 'about.law_info.american.rule1'),
      get(LOCALES.ja, 'about.law_info.american.rule2'),
      get(LOCALES.ja, 'about.species_info.american.desc'),
      get(LOCALES.ja, 'about.faq.a2'),
    ] as string[]
    for (const text of texts) {
      expect(text).not.toMatch(/飼育・販売・運搬/)
      expect(text).not.toMatch(/飼育・販売・野外への放流・遺棄はすべて禁止/)
    }
  })

  it('FR-284-21(ja): ウシガエルとの規制差が分かる（飼育・運搬も原則禁止）', () => {
    const bullfrog = get(LOCALES.ja, 'about.law_info.bullfrog.desc') as string
    expect(bullfrog).toMatch(/アメリカザリガニとちがって/)
    expect(bullfrog).toMatch(/飼うことや運ぶことも原則できません/)
  })

  it.each(LANGS)('FR-284-26: %s の about.* に罰則の金額・年数を書いていない', (lang) => {
    for (const [key, value] of entries(get(LOCALES[lang], 'about'), 'about')) {
      expect(value, key).not.toMatch(/100万円|1 million yen|100万日元|100만 엔|3年以下の懲役|拘禁刑/)
    }
  })

  it.each(LANGS)('FR-284-27: %s に終了済みの相談ダイヤルへの言及がない', (lang) => {
    for (const [key, value] of entries(LOCALES[lang])) {
      expect(value, key).not.toMatch(/相談ダイヤル|相談窗口ダイヤル/)
    }
  })
})

// ── intro.*（ストーリー本体の文言） ────────────────────────────────────────
describe('intro.*（REQ-284 §5.1）', () => {
  const REQUIRED_KEYS = [
    'intro.prompt.title',
    'intro.prompt.body',
    'intro.prompt.read',
    'intro.prompt.later',
    'intro.prompt.never',
    'intro.modal.title',
    'intro.modal.prev',
    'intro.modal.next',
    'intro.modal.close',
    'intro.modal.progress',
    'intro.modal.neverShowAgain',
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
      `intro.slides.${n}.title`,
      `intro.slides.${n}.body`,
      `intro.slides.${n}.imageAlt`,
    ]),
    'intro.slides.2.quote',
    'intro.slides.2.quoteSource',
    'intro.slides.2.quoteLink',
    'intro.cta.map',
    'intro.cta.post',
    'intro.cta.about',
    'intro.cta.lp',
    'intro.drawer.label',
    'banner.neverShowAgain',
  ]

  it.each(LANGS)('%s に必要なキーがすべて存在し、空でない', (lang) => {
    for (const key of REQUIRED_KEYS) {
      const value = get(LOCALES[lang], key)
      expect(typeof value, key).toBe('string')
      expect((value as string).trim(), key).not.toBe('')
    }
  })

  it('intro.modal.progress は {{current}} / {{total}} の内挿を持つ', () => {
    for (const lang of LANGS) {
      const value = get(LOCALES[lang], 'intro.modal.progress') as string
      expect(value).toContain('{{current}}')
      expect(value).toContain('{{total}}')
    }
  })

  it.each(LANGS)('AC-12: %s の intro.* に「大学」「研究室」等が含まれない', (lang) => {
    for (const [key, value] of entries(get(LOCALES[lang], 'intro'), 'intro')) {
      expect(value, key).not.toMatch(/大学|研究室|卒業研究|研究プロジェクト|university|research (lab|project)|大学|연구실|졸업 연구/)
    }
  })

  it('FR-284-09(ja): intro.* の本文に「！」や禁止語彙を使わない', () => {
    // quote / quoteSource は環境省ページの逐語引用と資料名なので原文どおり残す（FR-284-17/18）。
    const EXEMPT = new Set([
      'intro.prompt.title', // REQ-325: 指定原文「はじめまして！」を優先する。
      'intro.slides.2.quote', 'intro.slides.2.quoteSource'])
    for (const [key, value] of entries(get(LOCALES.ja, 'intro'), 'intro')) {
      if (EXEMPT.has(key)) continue
      expect(value, key).not.toMatch(/[！!]/)
      expect(value, key).not.toMatch(/保全|生態系サービス|モニタリング|意思決定|エビデンス/)
    }
  })

  it('FR-284-37(ja): 1枚目に「人が持ちこんだ」経緯が書かれている', () => {
    const body = get(LOCALES.ja, 'intro.slides.1.body') as string
    expect(body).toMatch(/人が.*持ちこんだ|人が.*持ち込んだ/)
  })

  it('FR-284-17/18(ja): 2枚目の引用に出典・参照日・リンク文言がそろっている', () => {
    expect(get(LOCALES.ja, 'intro.slides.2.quote')).toBe(
      '確認情報がない場所にも、生息している可能性はあることに注意。',
    )
    const source = get(LOCALES.ja, 'intro.slides.2.quoteSource') as string
    expect(source).toMatch(/出典：環境省ホームページ/)
    expect(source).toMatch(/2026年8月5日に利用/)
    expect(get(LOCALES.ja, 'intro.slides.2.quoteLink')).toMatch(/環境省ホームページ/)
  })

  it.each(LANGS)('FR-284-32: %s の imageAlt は「イラスト」だけで済ませていない', (lang) => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const alt = get(LOCALES[lang], `intro.slides.${n}.imageAlt`) as string
      expect(alt.length, `${lang} slide ${n}`).toBeGreaterThan(30)
    }
  })
})
