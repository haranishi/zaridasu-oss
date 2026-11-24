## 🟢 動作確認チェックリスト

ブラウザで以下を順に確認。問題なければ全 OK。

### A. 公開ページ
- [ ] `/` (ホーム) 表示
- [ ] `/about` 表示 (RSC 化済、約 5KB)
- [ ] `/terms` 表示 (RSC 化済、約 1KB)
- [ ] `/privacy` 表示 (RSC 化済、約 1KB)
- [ ] `/area` 表示 — 市区町村別の件数が正しい (例: 由利本荘市 23 件)
- [ ] `/area/[municipality]` 表示
- [ ] `/trends` 表示
- [ ] `/post/[id]` 投稿詳細 — 写真 / コメント / いいね全部出る (3 回 fetch → 1 回に集約済)
- [ ] OG image / SNS シェア URL が `https://zaridasu.com/...` で正しい (BASE_URL 集約済)

### B. ユーザー機能
- [ ] サインアップ / ログイン
- [ ] ホームで「投稿」→ 写真 + 音声を投稿
- [ ] 投稿フォームで地図ピン置ける (leaflet dynamic 化)
- [ ] 投稿フォームの市区町村選択
- [ ] 投稿後、AI 判定が走り `ai_result` が埋まる
- [ ] 投稿に「いいね」「コメント」できる
- [ ] コメントすると投稿者に通知メールが届く (REQ-132: comment_id 経由)
- [ ] 自分の投稿を編集できる (comment, count のみ)
- [ ] 自分の投稿は削除できる
- [ ] 検索バーで日本語 + 記号 (`, ( ) %`) で検索してもエラーなし (REQ-138)
- [ ] 言語切替 (もし UI にあれば) — 切替時に他言語ファイルが動的読み込み (REQ-145)

### C. 管理者機能
- [ ] サインアウト後 `/admin/posts` 直リンク → `/admin/login` にリダイレクト (REQ-137 fail-closed)
- [ ] admin でログイン → `/admin/posts` 表示 (列指定済、`ai_result` JSONB の egress 削減)
- [ ] `/admin/dashboard` 表示
- [ ] `/admin/comments` 表示
- [ ] `/admin/logs` (操作ログ) 表示
- [ ] `/admin/reports` 表示
- [ ] `/admin/users` 表示
- [ ] `/admin/ai-cost` 表示
- [ ] 「🔍 Gemini API ヘルスチェック」ボタン → `ok: true` 緑トースト (REQ-126)
- [ ] 投稿の「✅ 承認」「❌ 却下」「🗑 削除」が動く (削除バグ修正済、CHECK 拡張済)
- [ ] AI 判定失敗の投稿で「🔄 再判定する」が動く (REQ-125)
- [ ] `gemini_auth` エラー投稿があれば管理画面ヘッダーに警告バナー (REQ-126)
