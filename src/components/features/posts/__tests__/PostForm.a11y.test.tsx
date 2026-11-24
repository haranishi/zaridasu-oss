import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

// 実 PostForm は useAuth / Leaflet / Supabase 等の依存が多いため、
// REQ-040 で導入した htmlFor/id の関連付け方針を代表的なスニペットで守る。
// 破れた時に axe が検知することを保証する。

function PostFormLikeSnippet() {
  return (
    <form>
      {/* REQ-294: 実フォーム全体は依存が多いため、非地図入力のラベル関連付けと
          キーボード到達可能な現在地ボタンを代表スニペットで守る。 */}
      <fieldset>
        <legend>地図を使わずに位置を入力</legend>
        <label htmlFor="postform-location-latitude">緯度</label>
        <input id="postform-location-latitude" type="number" />
        <label htmlFor="postform-location-longitude">経度</label>
        <input id="postform-location-longitude" type="number" />
        <button type="button">現在地を使う</button>
      </fieldset>

      <label htmlFor="postform-count">個体数</label>
      <input id="postform-count" type="number" min={1} max={999} />

      <label htmlFor="postform-observed-at">観察日</label>
      <input id="postform-observed-at" type="date" />

      <label htmlFor="postform-comment">コメント</label>
      <textarea id="postform-comment" rows={3} />

      <button type="submit">投稿</button>
    </form>
  )
}

function BrokenFormSnippet() {
  return (
    <form>
      {/* 意図的に htmlFor/id を欠落させた形 — axe が label 関連付け違反を検知するはず */}
      <label>個体数</label>
      <input type="number" />
      <button type="submit">投稿</button>
    </form>
  )
}

describe('PostForm a11y smoke', () => {
  it('htmlFor+id が揃っていれば axe violations はゼロ', async () => {
    const { container } = render(<PostFormLikeSnippet />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('ネガティブ検証: htmlFor/id を欠くと label 関連付け違反が検知される', async () => {
    const { container } = render(<BrokenFormSnippet />)
    const results = await axe(container)
    expect(results).not.toHaveNoViolations()
  })
})
