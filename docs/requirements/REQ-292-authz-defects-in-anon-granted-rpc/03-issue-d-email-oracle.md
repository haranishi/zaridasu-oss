### 問題D: `check_email_exists` のメール存在確認オラクル（受容根拠が当該経路に掛かっていない） — Medium

`public.check_email_exists(lookup_email TEXT)`
定義: `supabase/schema.sql:1128-1140` ／ GRANT: `schema.sql:1150`、`supabase/migrations/20260703000003_req241_authz_enumeration_hardening.sql:164`（`TO anon, authenticated`）

```sql
-- supabase/schema.sql:1136-1138
RETURN EXISTS (
  SELECT 1 FROM auth.users WHERE email = lookup_email
);
```

`SECURITY DEFINER` で `auth.users` を直接引く。**関数内に認可・レート制限・CAPTCHA 検証が一切ない。**

REQ-241 はこの残余リスクを次のとおり受容している。

> `supabase/migrations/20260703000003_req241_authz_enumeration_hardening.sql:162`
> 「列挙リスクの残余は Turnstile（REQ-212）＋ Auth レート制限で受容（runbook に根拠）」

**この 2 つはいずれも `POST /rest/v1/rpc/check_email_exists` の直叩きには掛からない。**

- **Turnstile**: `src/components/modals/AuthModal.tsx:20-75, 131-132` のとおり、ブラウザ上のフォームに描画される Cloudflare のウィジェットであり、トークンは `supabase.auth.signUp({ options: captchaOpts })`（`AuthModal.tsx:305`）に渡される。**RPC 呼び出し（`AuthModal.tsx:295`）には介在しない**。site key 未設定なら `captchaEnabled=false` で完全 no-op にもなる
- **Auth レート制限**: `/auth/v1/*` に対する制限であり、**PostgREST の `/rest/v1/rpc/*` には適用されない**

したがって、公開 anon キーだけで任意の辞書を回し、**登録ユーザー全員のメールアドレスの在・不在を確認できるオラクルが公開状態**にある。本番は実在市民のメールアドレスを扱う（市民科学アプリとして一般ユーザーが登録する）ため、外部で入手したメールリストとの突合による**名寄せ（誰がこのサービスに登録しているかの特定）**に直結する。

なお REQ-241 の「Supabase Auth の `signUp` 自体が `identities` 空で存在を示唆する」という指摘は事実である（`AuthModal.tsx:306-312` がその判定を実装している）。ただし `signUp` 経路には Auth レート制限と Turnstile が実際に掛かるのに対し、RPC 経路にはどちらも掛からない。**「同じ情報が別経路でも漏れる」ことは「制限の無い経路を残してよい」理由にならない。**
