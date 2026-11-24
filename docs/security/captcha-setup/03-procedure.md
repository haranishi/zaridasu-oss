## 手順

### 1. Cloudflare Turnstile でサイトを作成（人手）

1. Cloudflare ダッシュボード → **Turnstile** → **Add site**。
2. ドメインに本番ドメイン（`zaridasu.com`）と必要なら `*.vercel.app`、`localhost` を登録。
3. Widget mode は **Managed**（推奨。無操作で通る正規ユーザーには摩擦が少ない）。
4. 発行された **Site Key** と **Secret Key** を控える。
   - 動作確認用には Cloudflare 公開のテストキー（常に成功する `1x00000000000000000000AA` など）も使える。

### 2. Supabase Auth で CAPTCHA を有効化（人手）

1. Supabase Dashboard → **Authentication** → **Settings**（Bot and Abuse Protection / CAPTCHA）。
2. **Enable CAPTCHA protection** を ON。
3. Provider に **Turnstile** を選択し、手順 1 の **Secret Key** を貼り付けて保存。
   - ローカルの `supabase/config.toml` は本ウェーブでは変更しない（REQ-221 で調整済みのため）。
     ローカルでも CAPTCHA を試す場合は将来 `[auth.captcha]`（`enabled` / `provider="turnstile"` /
     `secret="env(...)"`）を追加する運用とし、別 REQ で扱う。

### 3. site key を Vercel / ローカルに設定（人手）

1. Vercel → Project → **Settings** → **Environment Variables** に
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY = <Site Key>` を Production / Preview / Development それぞれ追加。
2. ローカルは `.env.local` に同名で追加（コミットしない）。
3. 再デプロイ / 再起動。`AuthModal` を開くと Turnstile ウィジェットが表示される。

### 4. 動作確認

- [ ] site key 設定後、`AuthModal`（ログイン / 新規登録 / リセット）に Turnstile ウィジェットが表示される。
- [ ] ウィジェット未解決のまま送信しようとすると、送信ボタンが無効、または `auth.errors.captchaRequired`
      が表示されサーバーへ行かない。
- [ ] 正常解決後はログイン / サインアップ / リセットメール送信が成功する（`options.captchaToken` が送られる）。
- [ ] **CSP 違反コンソールエラーが出ない**（`next.config.ts` の `script-src` / `frame-src` / `connect-src`
      に `https://challenges.cloudflare.com` を追加済み）。
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` を外すと CAPTCHA 無しで従来どおり動作する（fail-open）。

---
