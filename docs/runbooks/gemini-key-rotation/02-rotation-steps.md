## ローテーション手順

### Step 1. 新規 API キーを発行

1. [Google AI Studio](https://aistudio.google.com/app/apikey) にログイン（Gemini 開発に紐づく Google アカウント）
2. **Create API key** をクリックして新規キーを発行
3. 既存のプロジェクトに紐づける（請求対象プロジェクトが分散しないよう注意）
4. **新キーは絶対にチャット・Slack・CLI 履歴・コミット差分に貼らない**

### Step 2. Supabase secret を直接編集

> ⚠️ チャット / CLI 経由で値を渡すと履歴に残るリスクがあるため、**必ず Dashboard 上で直接編集する**。

1. Supabase Dashboard → 対象プロジェクト → **Edge Functions → Secrets** を開く
2. `GEMINI_API_KEY` の **Edit** をクリック
3. 値を新キーに貼り替えて保存
4. 1〜2 分待つと Edge Function が新 secret を読み込んで反映される

### Step 3. 動作確認

Phase 2 で `health-gemini` Edge Function が入るまでは、以下のいずれかで確認する。

**A. 既存の失敗投稿で再判定する（Phase 1 での暫定確認手段）**

1. 管理画面 `/admin/posts` を開く
2. `error_kind: 'gemini_auth'` で失敗した投稿の任意の 1 件を選び、**事前に投稿を再投稿し直すか、または admin として `/admin` UI から再判定をトリガする手段がある場合**にそれを実行（gemini_auth でボタンが disabled な場合は、別の `gemini_transient` / 通常投稿で新規 AI 判定が走るのを待つ）
3. `posts.ai_result.error` が消え、`ai_result.detected_species` 等が埋まれば成功

**B. curl で直接叩く**

```bash
GEMINI_API_KEY=<new-key>
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"ok"}]}],"generationConfig":{"maxOutputTokens":1}}'
```

`candidates` を含む JSON が返れば成功。`"error":{"code":400,"message":"API key not valid..."}` が返れば失敗（Step 1〜2 をやり直し）。

### Step 4. 旧キーを Revoke

1. AI Studio の API キー一覧に戻る
2. 旧キーの **Delete** を実行
3. 削除後に curl で旧キーが `400` を返すことを確認（即時反映でない場合あり）

