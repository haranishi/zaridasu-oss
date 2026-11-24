## 要件概要

### 背景・目的
調査依頼の詳細ページ `/request/[id]` にある「調査結果を投稿する」ボタンは、現状 `router.push('/')` するだけで **`survey_request_id` を引き継いでいない**。そのため:

- ユーザーが地図に戻っても「どの依頼への結果か」を覚えていないと紐付けが切れる
- 結果として作成された `posts` レコードに `survey_request_id` が NULL のまま入る
- `survey_requests.status` が `responded` に遷移するロジックが存在せず、open のまま停滞する

REQ-084 のロードマップ Phase 2 として、本要件は **依頼 → 結果投稿** の連結を完成させ、`status` 自動遷移までを担う。

### スコープ
**含む:**
- 「調査結果を投稿する」ボタンの動線改修（`survey_request_id` を URL クエリ or state で引き継ぎ）
- `PostForm` 側で `survey_request_id` を受け取り、`posts.insert` 時に付与
- 投稿フォームに「調査依頼への返信中」のバナー表示
- `posts` への INSERT トリガーで親 `survey_requests.status` を `responded` に自動遷移
- マイグレーション 1 件（DB トリガー新設）
- 既存依頼の status を遡って更新するバックフィル SQL（任意）

**含まない:**
- 「協力する」ボタン（応答機能） → REQ-087
- 通知 → REQ-088
- 一覧ページ → REQ-085 で完了済み前提
- 結果投稿の特別なフォーム（既存 `PostForm` を流用）

### 前提条件・制約
- 既存スキーマに `posts.survey_request_id UUID REFERENCES survey_requests(id) ON DELETE SET NULL` は **既に存在**
- 既存 RLS により `posts.insert` は `auth.uid() = user_id` で制限済み
- `survey_requests` の RLS は owner-only update。**status を別ユーザーが responded に遷移するには SECURITY DEFINER トリガーが必須**
- 既存 status enum: `'open' | 'responded' | 'closed'`。`closed` を responded に巻き戻すことはしない

---
