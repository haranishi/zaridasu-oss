## 2. 現状（実測値・2026-07-29）

### A. 新方式キーは既に発行済み

Management API `GET /v1/projects/edxmkqmjzbarjdgnkcvc/api-keys` の実測:

| name | type | 作成日 |
|---|---|---|
| `anon` | legacy | （プロジェクト作成時） |
| `service_role` | legacy | （プロジェクト作成時） |
| `default` | **publishable** | 2026-03-04 |
| `default` | **secret** | 2026-03-04 |

**4 種すべてが有効**。新方式への移行は「新規発行」ではなく「参照の切り替えとレガシーの無効化」だけで足りる。

### B. service_role キーを参照している箇所

`supabase/functions/` 配下で `SUPABASE_SERVICE_ROLE_KEY` を参照する**非テストのソースファイルは 14 本**（テストを含めると 24 ファイル）。

```
_shared/mailer.ts
analyze-audio/index.ts          analyze-image/index.ts
enrich-place/index.ts           notify-ai-anomaly/index.ts
notify-comment/index.ts         notify-dormant-reengage/index.ts
notify-gemini-key-failure/index.ts
notify-post-status/index.ts     notify-research-adopted/index.ts
notify-survey-request/index.ts  notify-weekly-digest/index.ts
send-push/index.ts              social-announce/index.ts
```

これは Edge Function 14 本のうち 13 本＋共有モジュール 1 本にあたり、**実質すべての Edge Function が対象**である。

アプリ側（`src/`）に service_role の参照は無い。`scripts/calc-ai-cost.ts` のみが開発者用途で参照している。

### C. Vault の登録状況

本番 `vault.secrets` に登録されているのは **1 件のみ**。

| name | 用途 |
|---|---|
| `edge_function_service_role_key` | `private.call_ai_edge_function()` / `public.call_lifecycle_edge_function()` 等の pg_net ラッパが Authorization ヘッダに使う |

> [!note] 併せて記録（本要件のスコープ外・別途判断）
> REQ-270 で導入した `x-webhook-secret` の送出は、Vault に `webhook_secret` が登録されている場合のみ有効になる設計（`supabase/migrations/20260717000001_webhook_secret_headers.sql`）だが、**現在 Vault に `webhook_secret` は登録されていない**。したがって pg_net からの呼び出しにシークレットヘッダは付いておらず、REQ-240 の fail-closed（`WEBHOOK_SECRET_ENFORCE`）を有効化すると**既存の呼び出しが全て弾かれる**。有効化する際は Vault 登録と Edge 側 env の両方を揃えること。

### D. ローテーション方式の比較

| | 方式 A: JWT シークレット再生成 | 方式 B: 新方式キーへ移行（**推奨**） |
|---|---|---|
| 対象 | `anon` と `service_role` が**同時に**変わる | `sb_secret_` へ参照を切り替え、レガシーを無効化 |
| ユーザー影響 | **全ユーザーがログアウト** | ログアウトなし |
| 停止リスク | Vercel の環境変数を差し替えて再デプロイするまで**サイトが壊れる窓**ができる（anon キーがバンドルに焼き込まれるため） | 段階移行が可能で窓を作らない |
| 作業量 | 環境変数 4 本の差し替え | Edge Function 14 本の書き換え＋再デプロイ＋Vault 更新 |
| 前提 | — | supabase-js が対応済み（`^2.110.7` で対応。REQ-286 時点の依存で充足） |

**方式 B を採用する。**

---
