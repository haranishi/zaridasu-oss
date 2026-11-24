## Step 1. 失効（rotate）— 最優先

### 1-A. Gemini API キー

詳細は [`gemini-key-rotation.md`](./gemini-key-rotation.md) に従う。漏洩対応では「旧キー Delete」を**待たずに**できるだけ早く実施する。

1. [Google AI Studio](https://aistudio.google.com/app/apikey) にログイン（Gemini 開発に紐づく Google アカウント）。
2. **Create API key** で新規キーを発行（既存の請求対象プロジェクトに紐づける）。
3. 旧キーを **Delete**（無効化）。AI Studio で削除できない場合は [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → 認証情報 → 該当 API キーを削除 / 無効化する。
4. **新キーは絶対にチャット・Slack・CLI 履歴・コミット差分・このrunbookに貼らない**。

### 1-B. Supabase access token

1. [Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens) を開く。
2. 漏洩したトークンの **Revoke** を実行（旧トークンを即無効化）。
3. **Generate new token** で新トークンを発行。スコープ / 名前を記録（値は記録しない）。
4. 旧トークンを使っていた箇所（GitHub Actions Secrets の `SUPABASE_ACCESS_TOKEN`、ローカルの環境変数 / `supabase login`）を §Step 2 で差し替える。

### 1-C. その他検出した種別（あれば）

- **service-role / anon key**（`.env.local` 由来の疑いがある場合）: Supabase Dashboard → Settings → API → 該当キーを **Rotate**。service-role の rotate は全 Edge Function / サーバー処理に波及するため、差替後に主要機能を確認する（[`incident/01-secret-leak.md`](./incident/01-secret-leak.md) 参照）。
- **その他の API キー**（Resend / Sentry / 逆ジオ系など）: 各サービスで revoke → 再発行。失効先は [`incident/01-secret-leak.md`](./incident/01-secret-leak.md) の対象シークレット表に従う。

---
