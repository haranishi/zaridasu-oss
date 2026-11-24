## 移行フェーズ

### フェーズ 1: Webhook を登録（あなたの作業、約 10 分）

Supabase Dashboard にログインし、以下の **2 つの Webhook** を登録する。

#### Webhook ①: 画像判定

| 項目 | 値 |
|---|---|
| Name | `analyze-image-on-insert` |
| Table | `posts` |
| Events | `Insert` のみ |
| Type | `Supabase Edge Functions` |
| Edge Function | `analyze-image` |
| HTTP Method | `POST` |
| HTTP Headers | `Content-Type: application/json`（Authorization は Dashboard が自動付与する `Bearer <service_role_key>` で OK） |
| HTTP Params | なし |

**手順**:
1. Supabase Dashboard → 対象プロジェクト → **Database** → **Webhooks**
2. **Create a new hook** をクリック
3. 上の表の通りに入力して保存

#### Webhook ②: 音声判定

| 項目 | 値 |
|---|---|
| Name | `analyze-audio-on-insert` |
| Table | `posts` |
| Events | `Insert`, `Update` の両方 |
| Type | `Supabase Edge Functions` |
| Edge Function | `analyze-audio` |
| HTTP Method | `POST` |
| HTTP Headers | `Content-Type: application/json`（Authorization は自動付与） |

**なぜ Update も有効にするのか**: 既存投稿に後から音声を追加するケース（管理画面からの再分析等）をカバーするため。冪等性ガードで不要な再実行は防がれる。

### フェーズ 2: 動作確認（あなたの作業、約 5 分）

1. **テスト投稿を作成**
   - 本番アプリからウシガエル写真＋音声を投稿する
2. **Supabase Dashboard → Edge Functions → Logs** を開く
3. `analyze-image` / `analyze-audio` それぞれのログを確認:
   - 期待: `[analyze-image] post <id> → ...` と `[analyze-audio] post <id> → ...` が出力される
   - 通常はクライアント invoke と Webhook の **2 回呼ばれる**（後者は `skipped: already_analyzed` になる）
4. **posts テーブルを確認**
   - SQL Editor で `SELECT id, ai_result, ai_analyzed_at, status FROM posts ORDER BY created_at DESC LIMIT 1;`
   - `ai_result.audio_analysis` と `combined_decision` が入っていれば OK

### フェーズ 3: クライアント invoke を削除（次回 PR で対応）

フェーズ 2 で Webhook 経由の起動が確認できたら、以下を削除する:

```ts
// src/hooks/usePostForm.ts:261-273
if (inserted?.photos?.length) {
  supabase.functions.invoke('analyze-image', { body: { record: inserted } })...
}
if (inserted?.audio_url) {
  supabase.functions.invoke('analyze-audio', { body: { record: inserted } })...
}
```

**注意: 再分析機能は残す** — 管理画面の「再判定」ボタン（REQ-050）が `reanalysis: true` フラグ付きで invoke を呼ぶケースは Webhook では代替できないため、別箇所の invoke はそのまま残す。

