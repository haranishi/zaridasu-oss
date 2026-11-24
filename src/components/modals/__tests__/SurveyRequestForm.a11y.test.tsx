import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

// REQ-189: SurveyRequestForm のモーダル a11y 改修（dialog 名・label 関連付け・
// グループ化・選択状態・閉じるボタン名・エラー通知）の回帰を axe で守る。
// 実 SurveyRequestForm は useAuth / Leaflet / Supabase 等の依存が多く軽量に
// マウントできないため、PostForm.a11y.test と同じく改修後マークアップを代表
// スニペットへ写し、破れた時に axe が検知することを保証する。

function SurveyRequestFormLikeSnippet() {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="survey-form-title">
      <div>
        {/* ヘッダー: 見出しが dialog の accessible name（aria-labelledby）になる */}
        <h2 id="survey-form-title">調査依頼を作成</h2>
        {/* 閉じるボタン: アイコンのみのため aria-label で名前を付与 */}
        <button type="button" aria-label="閉じる">
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <form>
        {/* REQ-294: 調査依頼にも同じ非地図入力を併設する。 */}
        <fieldset>
          <legend>地図を使わずに位置を入力</legend>
          <label htmlFor="survey-location-latitude">緯度</label>
          <input id="survey-location-latitude" type="number" />
          <label htmlFor="survey-location-longitude">経度</label>
          <input id="survey-location-longitude" type="number" />
          <button type="button">現在地を使う</button>
        </fieldset>

        {/* 対象種: role="group" + aria-labelledby でラベル付け、各ボタンに aria-pressed */}
        <label id="survey-species-label">対象の種類 *</label>
        <div role="group" aria-labelledby="survey-species-label">
          <button type="button" aria-pressed={true}>アメリカザリガニ</button>
          <button type="button" aria-pressed={false}>ウシガエル</button>
          <button type="button" aria-pressed={false}>不明</button>
        </div>

        {/* 調査理由: label htmlFor + textarea id の関連付け */}
        <label htmlFor="survey-reason">調査理由 *</label>
        <textarea id="survey-reason" rows={3} />

        {/* エラーバナー: role="alert" + コントラスト充足 */}
        <div role="alert" aria-live="assertive">
          地図をタップして場所を選択してください
        </div>

        {/* 送信: disabled は loading のみ（位置未選択でも押下可） */}
        <button type="submit">調査を依頼する</button>
      </form>
    </div>
  )
}

// ネガティブ検証用: 改修前の欠落（dialog 名なし / 閉じるボタン名なし /
// label 未関連付け）を再現し、axe が違反を検知することを確認する。
function BrokenSurveyFormSnippet() {
  return (
    <div role="dialog" aria-modal="true">
      <h2>調査依頼を作成</h2>
      {/* アイコンのみ・名前なし → button-name 違反 */}
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>
      <form>
        {/* htmlFor/id を欠く → label 違反 */}
        <label>調査理由</label>
        <textarea rows={3} />
        <button type="submit">調査を依頼する</button>
      </form>
    </div>
  )
}

describe('SurveyRequestForm a11y smoke', () => {
  it('改修後マークアップは axe violations がゼロ', async () => {
    const { container } = render(<SurveyRequestFormLikeSnippet />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('ネガティブ検証: ボタン名・label 関連付けを欠くと axe が違反を検知する', async () => {
    const { container } = render(<BrokenSurveyFormSnippet />)
    const results = await axe(container)
    expect(results).not.toHaveNoViolations()
  })
})
