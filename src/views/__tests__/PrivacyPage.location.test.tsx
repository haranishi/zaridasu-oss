import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import PrivacyPage from '@/views/PrivacyPage'

// map-location-follow（.kiro/specs/map-location-follow/）の受け入れ条件11:
// 地図の現在地（継続して取る機能）について、プライバシーのページが事実を書いていること。
// 実装を変えたのに文面が古いまま残る、または言い過ぎる（「端末の外へは出さない」）のを防ぐ。

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
}))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}))

const section = () => {
  const { container } = render(<PrivacyPage />)
  const heading = [...container.querySelectorAll('h2')].find((h) => h.textContent === '位置情報について')
  expect(heading, '「位置情報について」の節がある').toBeTruthy()
  return heading!.parentElement!.textContent ?? ''
}

describe('プライバシーページ：地図の現在地の追従', () => {
  it('継続して取ること、止める方法、一時停止中も取得が続くことを書いている', () => {
    const text = section()
    expect(text).toContain('「現在地を表示」')
    expect(text).toContain('繰り返し取得')
    expect(text).toContain('もう一度押して止める')
    expect(text).toContain('一時停止しているあいだも')
  })

  it('追従のために取得した位置を、当サイトが自動で送信・保存・解析へ送らないこと、保存されるのは本人が保存を押したときだけであることを書いている', () => {
    const text = section()
    expect(text).toContain('追従のために取得した位置を、当サイトが自動で送信・保存したり、アクセス解析へ送ったりすることはありません')
    expect(text).toContain('ユーザーが保存の操作をしたときだけ')
  })

  it('利用者が押した機能（投稿・非公開で保存・近くの水域を探す）は別で、座標が使われ、送信や保存が起きうることを書いている（言い過ぎない）', () => {
    const text = section()
    expect(text).toContain('ユーザーが操作したときは別です')
    // 画面のボタンの名前（map.nearbyWater.button・quickSave.button）と同じ言葉で書く
    expect(text).toContain('「近くの水域を探す」')
    expect(text).toContain('「非公開で保存」')
    expect(text).toContain('現在地に合わせた地図の中心')
  })

  it('背景画像の取得で、現在地の周辺の地域が提供元に伝わることを書いている（言い過ぎない）', () => {
    const text = section()
    expect(text).toContain('OpenStreetMap')
    expect(text).toContain('国土地理院')
    expect(text).toContain('IPアドレス')
    // 背景画像の要求が現在地の周辺を示すので、「端末の外へは出さない」とは書けない
    expect(text).not.toContain('端末の外')
    expect(text).not.toContain('一切')
  })

  it('取得している間は画面を点灯すること、追従中は「現在の地図範囲内のみ」を自動でオフにすることを書いている', () => {
    const text = section()
    expect(text).toContain('画面を点灯したまま')
    expect(text).toContain('「現在の地図範囲内のみ」')
    expect(text).toContain('自動でオフ')
  })

  it('既存の「投稿時の現在地取得」の説明を残している（矛盾させない）', () => {
    expect(section()).toContain('投稿時に現在地取得を使用した場合')
  })
})
