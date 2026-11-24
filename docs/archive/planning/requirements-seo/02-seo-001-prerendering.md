## SEO-001: SPA プリレンダリング対応（最重要）

### 背景

React SPA は JavaScript を実行しないと DOM が生成されない。Google は JavaScript をレンダリングするが：
- クロールの優先度が下がる（レンダリングキューに遅延）
- 全投稿詳細ページのクロールは現実的でない
- Twitter・LINE 等の SNS プレビューは JS を実行しないため、OGP が表示されない

### ユーザーストーリー

```
As a 外来種情報を検索するユーザー,
I want to「秋田市 アメリカザリガニ 目撃」でGoogle検索したときに出没情報が出てきてほしい,
So that ザリガニダスを知らなくても情報にたどり着ける。

受け入れ条件:
- [ ] 投稿詳細ページ（/post/:id）がGoogleに正しくインデックスされる
- [ ] SNS（Twitter/LINE）でURLをシェアしたとき、OGP画像・タイトルが表示される
- [ ] クローラーがアクセスしたとき、JSなしでも title/description が読める
- [ ] ページのHTMLソースに投稿の title/description が含まれている
```

### 実装方針の選択

#### 方針A: Vercel Edge Function によるプリレンダリング（推奨）

**概要**: クローラーからのアクセスを検知し、Supabase からデータを取得して完全な HTML を返す

```
クローラーアクセス:
  User-Agent: Googlebot
  → Vercel Edge Function が起動
  → Supabase から投稿データを取得
  → <meta> タグを挿入した HTML を返す

通常ユーザーアクセス:
  User-Agent: Chrome
  → 通常の index.html を返す（既存の React SPA）
```

**コスト**: 中（Edge Function の実装が必要）
**効果**: 高（投稿詳細ページが正しくインデックスされる）
**リスク**: 低（既存の SPA に影響しない）

```javascript
// api/prerender.js（Vercel Edge Function）
export default async function handler(req) {
  const isBot = /Googlebot|Twitterbot|facebookexternalhit|LineBot/i.test(
    req.headers.get('user-agent') ?? ''
  )
  if (!isBot) return // 通常ユーザーは SPA にフォールバック

  const postId = req.url.match(/\/post\/([^/?]+)/)?.[1]
  if (!postId) return

  // Supabase から投稿データを取得
  const post = await fetchPost(postId)
  if (!post) return

  // index.html の <head> に動的 meta タグを注入して返す
  const html = buildHtmlWithMeta(post)
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}
```

#### 方針B: vite-plugin-ssg によるビルド時プリレンダリング

**概要**: ビルド時に静的 HTML を生成する

**コスト**: 大（既存コードの大幅な変更が必要）
**効果**: 高
**リスク**: 高（ビルドパイプラインの変更）

**→ 方針A（Edge Function）を推奨**

---

