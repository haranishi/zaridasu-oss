## REQ-292. 【訂正】「Turnstile ＋ Auth レート制限で受容」は RPC 直叩きには成立しない

> この節は**過去の受容判断の訂正記録**である。元の記述を消さずに残し、誤りだった事実と対処を追記する
> 方式を採っている（同じ判断を将来また持ち出さないため）。

### 何が誤りだったか

`supabase/migrations/20260703000003_req241_authz_enumeration_hardening.sql:162` は、`check_email_exists`
に `anon, authenticated` の EXECUTE を明示 GRANT する判断の根拠として次を記録した。

> 「列挙リスクの残余は Turnstile（REQ-212）＋ Auth レート制限で受容（**runbook に根拠**）」

**この受容根拠は 2 つとも成立していなかった。** さらに参照先として挙げられた「runbook」（本書）に
その根拠は一度も書かれておらず、**参照自体が空振りだった**（本節がその欠落の埋め合わせでもある）。

| 挙げられた根拠 | なぜ `POST /rest/v1/rpc/check_email_exists` に効かないか |
|---|---|
| Cloudflare Turnstile（REQ-212 FR-212-04） | ブラウザ上のフォームに描画されるウィジェットで、token は `supabase.auth.signUp()` 等 **Auth SDK 呼び出しの `options.captchaToken`** に同梱される。PostgREST の RPC 呼び出しには**一切介在しない**。加えて `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 未設定なら `captchaEnabled=false` で**完全 no-op** になる |
| Supabase Auth のレート制限 | `/auth/v1/*` に対する制限であり、**PostgREST の `/rest/v1/rpc/*` には適用されない** |

結果として「公開 anon キーだけで任意の辞書を回し、登録ユーザーのメールアドレスの在・不在を確認できる
オラクル」が公開状態だった。本番は実在市民のメールアドレスを扱うため、外部で入手したメールリストとの
突合による名寄せ（誰がこのサービスに登録しているかの特定）に直結する。

> **教訓（受容判断のレビュー観点）**: 「別経路でも同じ情報が漏れる」ことは「制限の無い経路を残してよい」
> 理由にならない。緩和策を受容根拠に挙げるときは、**その緩和策が当該経路に技術的に介在するか**を
> 経路単位（`/auth/v1/*` なのか `/rest/v1/rpc/*` なのか）で確認する。

### REQ-292 での対処

- `check_email_exists` から `anon` / `authenticated` の EXECUTE を REVOKE し、本体先頭にサーバー側
  呼び出し元限定のゲートを追加（migration `20260730000001_req292_authz_defects_anon_granted_rpc.sql`）。
- フロントの事前チェック（`AuthModal.tsx`）を廃止し、サインアップの重複判定は `signUp` 後の
  `identities` 空判定（＝Auth レート制限と Turnstile が**実際に掛かる**経路）に一本化。
- 同 migration で `admin_login_record` / `admin_login_check` / 新設の Auth Hook 関数も同様に剥奪。
- CI の一括 GRANT が REVOKE を打ち消すため、`supabase/ci/reapply-after-grants.txt` に本 migration を
  追記済み（関数 EXECUTE の REVOKE も再適用対象であることを同ファイル冒頭のルールに明記した）。
- 回帰テスト: `supabase/tests/req292_anon_granted_rpc_authz.sql`（28 アサーション）。

### 同じ根拠を流用していないかの点検結果（REQ-292 要確認事項）

| 参照元 | 判定 |
|---|---|
| 本書（`supabase-hardening-checklist.md`） | 当該根拠の記述は**存在しなかった**（migration の「runbook に根拠」が空参照）。本節で訂正を記録 |
| `docs/requirements/REQ-241-*.md`（FR-241-02 / NFR-241-03 / AC-02） | 「CAPTCHA / レート制限で受容可能な水準まで下げる」を要求。**同じ誤りを内包**するため各所に訂正注記を追記 |
| `docs/requirements/REQ-212-*.md`（FR-212-04） | Turnstile を**認証フォーム**（`signInWithPassword` / `signUp` / `resetPasswordForEmail`）に付ける要件であり、この範囲では**主張は正しい**。ただし「管理者ログインには IP+email_hash のレート制限が既存」という記述は REQ-292 問題B で否定されたため訂正注記を追記 |
| `docs/security/captcha-setup.md` | Turnstile の適用範囲を「認証フォームのみ」と明記していなかったため、カバー範囲の境界を追記 |

✅ 合格基準（リリース前）: 下表 REQ-292 行の GRANT 実測が 4 本すべて `false`。

---
