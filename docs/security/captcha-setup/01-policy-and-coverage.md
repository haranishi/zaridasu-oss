## 採用方針

- **プロバイダ**: Cloudflare Turnstile（無料・軽量・プライバシー配慮。hCaptcha でも可だが Turnstile を推奨）。
- **npm 依存ゼロ**: ウィジェット JS は `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">`
  をクライアントで動的ロードする（`AuthModal.tsx` に実装済み）。`@upstash/*` 等の追加パッケージは入れない。
- **fail-open（未設定時はスキップ）**: 環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` が**未設定なら CAPTCHA を
  完全に無効化**する。開発環境・未設定の本番でアプリが壊れない。さらに Supabase 側で CAPTCHA を有効化
  しない限り、`captchaToken` 無しでも Auth は通る。**「site key 設定」＋「Supabase Dashboard で CAPTCHA 有効化」
  の両方が揃って初めて強制**される（多層化のうち CAPTCHA 層）。

> 多層防御の位置づけ：CAPTCHA は「人間性の確認」層。公開書き込み（通報 / コメント / いいね / 投稿 /
> 調査依頼）の頻度上限は **DB トリガー**（最終防衛線・`supabase/schema.sql` /
> `migrations/20260616000002_public_endpoint_rate_limit.sql`）が、認証到達面のバースト緩和は **エッジ
> ミドルウェア**（`src/middleware.ts`・インメモリ）が担う。CAPTCHA 単体に依存しない。

### ⚠ Turnstile がカバーする範囲（REQ-292 で追記した境界の明示）

Turnstile が効くのは **`AuthModal` が `options.captchaToken` を渡す Supabase Auth SDK 呼び出しだけ**である。
具体的には `signInWithPassword` / `signUp` / `resetPasswordForEmail`（＝`/auth/v1/*`）に限られる。

**掛からない経路（受容根拠に使ってはいけない）:**

| 経路 | 理由 |
|---|---|
| `POST /rest/v1/rpc/*`（PostgREST の RPC） | Turnstile はブラウザのフォームに描画されるウィジェットで、RPC 呼び出しには介在しない。**Supabase Auth のレート制限も `/auth/v1/*` 対象なので同様に掛からない** |
| `POST /rest/v1/<table>`（テーブル直 INSERT） | 同上。頻度上限は DB トリガーが担う |
| Edge Function の直 invoke | 関数内で `siteverify` を自前検証しない限り無関係 |
| site key 未設定時のすべての経路 | `captchaEnabled=false` で**完全 no-op** になる（上記 fail-open 方針） |

REQ-241 は `check_email_exists`（RPC）の列挙リスクを「Turnstile ＋ Auth レート制限で受容」と記録したが、
上表のとおり**どちらも当該経路に介在せず受容根拠として成立していなかった**。REQ-292 で経路自体を閉じた。
経緯は `docs/runbooks/supabase-hardening-checklist.md`「REQ-292.【訂正】」節を参照。

---
