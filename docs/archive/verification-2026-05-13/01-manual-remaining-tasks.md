## ⚠️ 手動でやる必要がある残作業

### 1. Vercel デプロイ (Next.js コード反映)

Group B + C の大半は **Next.js コード変更**なので、Vercel に push されてビルド完了するまで本番反映されない。

```bash
# 確認: 自動デプロイ ON なら数分で完了済み
# 自動 OFF なら以下を実行:
! npx vercel --prod
```

⚠️ Vercel ログイン (`vercel login`) は本セッション内で失敗した。改めて実施が必要。

### 2. REQ-131: Edge Function webhook 認証 enforcement (任意)

現状: コードは適用済、WEBHOOK_SECRET 未設定で **grace period (警告ログ + 通過)** 動作中。
本番で実害を防ぐには以下を実施:

```bash
# (1) シークレット生成
openssl rand -hex 32
# 例: a3b4c5d6e7f8...

# (2) Supabase secret に登録
SUPABASE_ACCESS_TOKEN=<新しい token> \
  npx supabase secrets set WEBHOOK_SECRET=<生成した値> \
  --project-ref edxmkqmjzbarjdgnkcvc

# (3) Edge Function を再デプロイ (env 反映、毎回必須)
SUPABASE_ACCESS_TOKEN=<token> \
  npx supabase functions deploy \
  analyze-image analyze-audio notify-post-status notify-comment notify-survey-request \
  --project-ref edxmkqmjzbarjdgnkcvc
```

**(4) Supabase Dashboard → Database → Webhooks** で全 webhook の "HTTP Headers" に追加:
```
x-webhook-secret: <(2) と同じ値>
```

対象 webhook (推定):
- `analyze-image-on-insert` (posts INSERT)
- `analyze-audio-on-insert` (posts INSERT/UPDATE, audio_url IS NOT NULL)
- `notify-post-status-on-update` (posts UPDATE, status 変化)
- `notify-survey-request-*` (survey_requests INSERT)

### 3. (任意) REQ-138 のバナー判定厳密化

REQ-131 と関連。`gemini_auth` 分類を 401/403 のみに絞り、400 (responseSchema バグ等) を `gemini_bad_request` に分ける改修。今は偽陽性でバナー出ることあり。

---
