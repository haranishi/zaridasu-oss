## Step 2. 新しい値を Secrets へ（コミットしない）

> ⚠️ チャット / CLI 引数経由で値を渡すと履歴に残る。**必ず各サービスの Dashboard / Secrets 画面で直接入力する**。

| 新しい値 | 入れる場所 |
|---|---|
| Gemini API キー | **Supabase Dashboard → 対象プロジェクト → Edge Functions → Secrets** で `GEMINI_API_KEY` を Edit（[`gemini-key-rotation.md`](./gemini-key-rotation.md) Step 2）。Vercel 側でも Gemini を使う場合は **Vercel → Project → Settings → Environment Variables** を更新 |
| Supabase access token | **GitHub → Repo → Settings → Secrets and variables → Actions** の `SUPABASE_ACCESS_TOKEN` を Update。ローカルは `supabase login`（新トークンで対話入力）し、シェル履歴に残さない |
| （該当すれば）その他キー | Vercel / Supabase / GitHub Actions のいずれか正しい配置先へ。`NEXT_PUBLIC_` には秘密を入れない（クライアントに必ず露出する） |

- Secret 更新後、**Edge Function は env キャッシュのため再デプロイが必要**: [`edge-function-deploy.md`](./edge-function-deploy.md) の手順で対象関数を deploy し直す。
- `.env.example` には**変数名のみ（値なし）**を記載する（REQ-017 FR-017-06）。

---

## Step 3. 動作確認（新しい値で本番が動くか）

- [ ] Gemini: [`gemini-key-rotation.md`](./gemini-key-rotation.md) の「Step 3 動作確認」（curl 疎通 or 新規投稿の AI 判定）で `candidates` / `ai_result` が返る
- [ ] Supabase CLI: 新トークンで `npx supabase functions list --project-ref edxmkqmjzbarjdgnkcvc` が成功する
- [ ] Vercel: 再デプロイ後、本番の主要フロー（投稿・AI 種判定・通知・管理画面）が 1 周通る
- [ ] **旧キーが無効化されていることを確認**（旧 Gemini キーで curl が `400 API key not valid`、旧 Supabase トークンで CLI が認証エラー）

> ここまで（①〜③）で**漏洩リスクは実質的に無効化**される。④以降は「これ以上、過去の値を目に触れさせない」ための後処理。

---
