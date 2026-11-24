### 問題A: 二重送信の同期ガードの適用漏れ — Low

REQ-223 FR-223-08 は「ボタンの `disabled` は state 反映前の連打にわずかな隙があるため、送信ハンドラの**冒頭で同期 return する**」という方針を定め、3箇所にコメント付きで実装している。

```
// PostForm.tsx:172-176
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
  // ボタンの disabled={loading} は state 反映前の連打に隙があるため、ここで処理中なら即 return する。
  // 最終防衛はサーバー側冪等（DB レートリミット check_post_rate_limit / 画像 hash dedup）。
  if (loading) return
```

同型が `SurveyRequestForm.tsx:78-81` と `AuthModal.tsx:258` にある。一方、次の3系統は `disabled` 頼みで**冒頭の同期ガードが無い**。

| 場所 | 現況 |
|---|---|
| `src/components/modals/EditProfileModal.tsx:85-105` | `handleSave` が `setSaving(true)`（`:86`）から始まり、冒頭に `if (saving) return` が無い。保存ボタンは `disabled={saving}`（`:278`）のみ |
| `src/components/modals/ReportModal.tsx:45-49` | `handleSubmit` は `e.preventDefault()` → `if (!reason)` の検証から始まり、`setLoading(true)` は `:63`。`loading` state（`:35`）の同期チェックが無い |
| `src/views/admin/AdminPostsPage.tsx:93-103` | `handleBulkDelete` / `handleBulkApprove` がいずれも確認ダイアログを閉じてから `await bulkDelete()` / `await bulkApprove()` を呼ぶだけ |

実害の大きさは3者で異なる。`ReportModal` の重複送信は DB の重複通報制約（`schema.sql:457`「この投稿はすでに通報済みです」）で弾かれるため最終的には安全側だが、**ユーザーには「送信に失敗しました」という汎用エラーが出る**（UX監査 M-12・REQ-299 の対象）。`AdminPostsPage` の一括操作は**サーバー側の冪等性が無い**ため、重複実行が監査ログの二重記録やストレージ削除の二重呼び出しにつながる（REQ-295 の対象領域）。

### 問題B: 未送信下書きの日時がロケール固定＋blob URL が解放されない — Low

`src/components/features/dashboard/PendingPostsSection.tsx` に2点ある。

**B-1（ロケール固定）**: `:132`

```
{new Date(post.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
```

REQ-277 Phase1 は date-fns の `ja` ロケール固定4ファイルを直したが、**この箇所は Phase1 / Phase2 のいずれの対象表にも入っていない**（`toLocaleString` の第1引数という別の形をしていたため機械検出から漏れた）。同種の表示は `ProfilePage.tsx:20` と `SpeciesDexCard.tsx:12` が `DATE_LOCALE_TAG` マップで言語に追随させており、**実装が非対称**である。英語UI利用者にも `ja-JP` 書式（「7/30 14:05」）が出る。

**B-2（blob URL リーク）**: `:139-140`

```
<img
  src={URL.createObjectURL(post.photos[0])}
```

**レンダー内で `URL.createObjectURL` を呼び、`revokeObjectURL` を一度も呼んでいない**。再レンダーごとに新しい blob URL が生成され、ドキュメントが生きている間ずっと解放されない。対比として `src/hooks/posts/usePostForm.ts:56-64` は生成した blob URL を丁寧に revoke している。未送信下書きは複数件あり得るうえ、送信リトライやオンライン復帰（REQ-197）で再レンダーが起きるため、蓄積する。
