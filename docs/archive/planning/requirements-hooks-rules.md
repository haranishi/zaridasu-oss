> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: Rules of Hooks 違反修正

## 概要

- **ID**: BUG-001
- **優先度**: 🔴 高（即時修正）
- **作成日**: 2026-03-15
- **対象ファイル**: `src/pages/DetailPage.jsx`

---

## 問題

`DetailPage.jsx` で `useDetailSEO` フックが条件付きリターン（`if (loading) return` / `if (!post) return`）の**後に**呼び出されている。

```jsx
// 問題箇所（L68〜L93）
if (loading) return <LoadingSpinner />          // ← 早期リターン
const isOwner = ...
if (!post) return <NotFoundView />              // ← 早期リターン

const { seoTitle, ... } = useDetailSEO(post)   // ← 条件付き return 後にフック呼び出し！
```

`useDetailSEO` は内部で `useTranslation`（React フック）を呼び出している。

React の「フックは条件分岐・早期リターンより前に呼び出さなければならない」という Rules of Hooks に違反しており、開発環境では `Rendered fewer hooks than expected` エラーが発生しうる。

---

## 修正方針

`useDetailSEO` 呼び出しを、すべての条件付きリターンより前（他のフック呼び出しと同じ位置）に移動する。

`useDetailSEO` は `post` が `null` の場合にも安全に動作するよう設計されている（内部で `if (!post) return { ...empty }` が実装済み）。

```jsx
// 修正後のフック呼び出し順序
const { likeCount, liked, ... } = useLike(id)
const [post, setPost] = useState(null)
// ... (他のフック)
const { seoTitle, ... } = useDetailSEO(post)   // ← ここに移動

// その後に条件付きリターン
if (loading) return <LoadingSpinner />
if (!post) return <NotFoundView />
```

---

## テスト観点

- `loading=true` → `loading=false, post=null` → `post={...}` のライフサイクルでフック呼び出し数が変わらないこと
- 存在しない ID でアクセスした場合、`不明な情報` 画面が正しく表示されること
- 正常な投稿 ID でアクセスした場合、SEO タグが正しく設定されること
