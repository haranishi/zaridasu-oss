/**
 * REQ-284 §7: `/about` の法令説明は <Trans> で `<0>…</0>` を <strong> に差し込んで描画している。
 *
 * 他の AboutPage テストは react-i18next を「キーをそのまま返す」形でモックしているため、
 * **Trans の実描画は一度も検証されていなかった**。react-i18next の v17 は Trans の
 * HTML ノード直列化を変更しており（`transKeepBasicHtmlNodesFor` の修正）、壊れても
 * モック済みテストと「リンクの存在だけ見る」E2E では緑のまま通ってしまう。
 *
 * ここだけは**本物の i18next を初期化して**描画し、法令の一文が最後まで表示され、
 * 強調部分が <strong> として出ることを固定する。誤った法令表記は公開ページに出るので、
 * 描画が壊れて文が欠けることを検知できる状態にしておく。
 */
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { I18nextProvider, Trans, initReactI18next } from 'react-i18next'
import ja from '@/locales/ja/translation.json'

const instance = i18next.createInstance()

beforeAll(async () => {
  await instance.use(initReactI18next).init({
    lng: 'ja',
    fallbackLng: 'ja',
    resources: { ja: { translation: ja } },
    interpolation: { escapeValue: false },
  })
})

function renderLaw(i18nKey: string) {
  return render(
    <I18nextProvider i18n={instance}>
      <p>
        <Trans i18nKey={i18nKey} components={[<strong key="0" data-testid="emphasis" />]} />
      </p>
    </I18nextProvider>,
  )
}

describe('REQ-284 /about 法令説明の <Trans> 実描画', () => {
  it('アメリカザリガニ: 「飼える」と「野外に放すのは禁止」が両方描画され、強調が strong になる', () => {
    const { container } = renderLaw('about.law_info.american.desc')

    // 是正の要点。ここが欠けると「飼育も禁止」という誤解に戻る。
    expect(container.textContent).toContain('これまで通りできます')
    expect(container.textContent).toContain('手続きもいりません')
    // <0>…</0> が strong として差し込まれている（インデックス指定が効いている）
    const emphasis = screen.getByTestId('emphasis')
    expect(emphasis.tagName).toBe('STRONG')
    expect(emphasis.textContent).toContain('野外に放したり')
    // タグ記法が生のまま出ていない
    expect(container.textContent).not.toContain('<0>')
  })

  it('ウシガエル: アメリカザリガニとの規制差（飼う・運ぶも不可）が描画される', () => {
    const { container } = renderLaw('about.law_info.bullfrog.desc')

    expect(container.textContent).toContain('アメリカザリガニとちがって')
    const emphasis = screen.getByTestId('emphasis')
    expect(emphasis.tagName).toBe('STRONG')
    expect(emphasis.textContent).toContain('飼うことや運ぶことも原則できません')
    expect(container.textContent).not.toContain('<0>')
  })

  it('罰則の金額・年数が復活していない（FR-284-26）', () => {
    const { container } = renderLaw('about.law_info.bullfrog.desc')
    expect(container.textContent).not.toMatch(/\d+万円|\d+年以下|懲役|拘禁刑/)
  })
})
