> [!important] 本要件の性質
> REQ-131 → REQ-240 → REQ-270 で**コード側のチェーンは完成している**。残っているのは「本番に値を供給して grace period を閉じる」人手の運用タスク（FR-291-01〜03）であり、コード変更は監視（FR-291-04）とエラー応答の固定文言化（FR-291-05）のみである。
> したがって本要件を「実装待ち」として放置すると、**コードは fail-closed 可能なのに本番だけ fail-open のまま**という現状が続く。

## 背景

REQ-240 は Edge Function 側に `requireWebhookSecret()` を導入し、REQ-270 は pg_net 送出側に `x-webhook-secret` を付与する仕組みを入れた。運用手順は「①Vault に `webhook_secret` を登録 → ②Edge Function の env に同値の `WEBHOOK_SECRET` を設定 → ③Database Webhook にもヘッダを追加 → ④`WEBHOOK_SECRET_ENFORCE=true`」（REQ-270 FR-270-04）である。**この①〜④が本番でどれも実施されていない。**

### 問題A: grace period が本番で常時成立し、webhook 系 Edge Function 12 本が検証ゼロで通過している — High

`supabase/functions/_shared/webhookAuth.ts` の挙動:

- `:46-51` `isWebhookSecretEnforced()` は `WEBHOOK_SECRET_ENFORCE` が `'true'`/`'1'` のときだけ true。**未設定なら false**。
- `:62-88` `requireWebhookSecret()` は `WEBHOOK_SECRET` が未設定かつ enforce 無効のとき、`console.warn('[webhookAuth] SECURITY event=webhook_secret_unset_passthrough: …')` を出して **`return`（＝通過）** する。

送出側（`supabase/migrations/20260717000001_webhook_secret_headers.sql:43-58`）も、Vault に `webhook_secret` が無ければヘッダを付けずに送る設計（`:51-52` の `EXCEPTION WHEN OTHERS THEN v_secret := NULL`、`:54-56` で secret がある時だけ付与）である。

**本番の Vault に `webhook_secret` は登録されていない**（REQ-287 §2-C の実測記述: `docs/requirements/REQ-287-supabase-key-migration-and-rotation.md:104`）。Edge 側 `WEBHOOK_SECRET` も未設定と判断できる——もし設定済みなら送出側がヘッダ無しで送るため既存通知が全て 401 で壊れているはずで、REQ-287 の記述と矛盾する。

結果、`requireWebhookSecret()` を呼ぶ **12 本すべてが検証ゼロで通過する**。

```
analyze-audio          analyze-image          enrich-place
notify-ai-anomaly      notify-dormant-reengage
notify-gemini-key-failure                     notify-post-status
notify-research-adopted                       notify-survey-request
notify-weekly-digest   send-push              social-announce
```

`supabase/config.toml` に `[functions.*]` セクションも `verify_jwt` 指定も存在しないため、プラットフォーム既定の `verify_jwt = true` は効いている。しかしそのゲートを通るのに必要なのは**フロントエンドのバンドルに焼き込まれた公開 anon キーだけ**である。すなわち実質的に誰でも到達できる。
