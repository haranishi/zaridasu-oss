# REQ-240: Edge Function webhook 認証の本番 fail-closed 化（grace period 常態化の解消）

## 背景
ザリダスの通知・連携系はすべて Supabase Edge Functions（Deno）で実装され、Database Webhook / pg_cron（pg_net）から呼ばれる。これらは `service_role` キーで DB にアクセスし、メール送信（Resend）・Web Push・逆ジオコーディング（外部 API・従量課金）・SNS 自動投稿といった**副作用と課金を伴う操作**を行う。REQ-131 でこれらの呼び出しに共有秘密 `x-webhook-secret`（`WEBHOOK_SECRET`）による検証ヘルパ `requireWebhookSecret()` が導入された。しかし現状はデプロイ手順の都合で**「秘密未設定なら検証を素通り（grace period）」**という一時的な後方互換モードのまま運用されており、この fail-open が恒久化している。

## 現状の問題
（ファイルパス:行番号つき）

### 1. `WEBHOOK_SECRET` 未設定時に認証が素通りする（fail-open）
- `supabase/functions/_shared/webhookAuth.ts` の `requireWebhookSecret(req)`：
  ```ts
  const expected = Deno.env.get('WEBHOOK_SECRET')
  if (!expected) {
    console.warn('[webhookAuth] WEBHOOK_SECRET 未設定。dev/migration 期間以外では設定必須')
    return   // ← grace period: 未設定なら検証せず通過
  }
  ```
  env が未設定なら**警告ログを出して通過**する。設計コメント（`webhookAuth.ts` 冒頭）も「一時的な後方互換措置。本番運用では必ず secret を設定すること」と明記しているが、コードは未設定を無期限に許容する。

### 2. 本番が現に「未設定＝素通り」で動いている
- `docs/verification-2026-05-13.md:25`：「現状: コードは適用済、**WEBHOOK_SECRET 未設定で grace period（警告ログ + 通過）動作中**」。つまり本番の webhook 系関数は現在**認証なしで呼び出し可能な状態**。

### 3. 影響を受ける関数が広い（service_role + 副作用 + 課金）
- `requireWebhookSecret` の呼び出し元（`grep` 実測・10 関数）：`notify-post-status` / `notify-research-adopted` / `notify-weekly-digest` / `notify-dormant-reengage` / `notify-survey-request` / `send-push` / `social-announce` / `enrich-place` / `analyze-image` / `analyze-audio`。
- これらは `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` で service_role クライアントを生成し（例：`social-announce/index.ts:78`, `enrich-place/index.ts:105`, `notify-post-status/index.ts:93`）、RLS を迂回してメール送信・Push 配信・外部ジオコーディング・SNS 投稿を実行する。
- `supabase/config.toml` に `[functions.*] verify_jwt` の個別設定が無く、プラットフォーム側 JWT 検証にも依存しきれない（webhook 呼び出しは JWT ではなくヘッダ秘密で認証する設計）。したがって `WEBHOOK_SECRET` が**唯一のアプリ層防御**であり、それが素通りだと関数 URL を知る第三者が直接叩ける。

### 想定される悪用・障害シナリオ
- 関数 URL（推測可能な命名・過去のネットワークログ・リポジトリ由来）を得た第三者が `notify-weekly-digest` / `notify-dormant-reengage` を反復起動 → **全ユーザーへのメール大量送信**（Resend 課金・レピュテーション毀損・スパム認定）。
- `enrich-place` / `analyze-*` を反復起動 → 外部ジオコーディング / Gemini の**従量課金を意図的に膨張**（REQ-218 の課金ガードレールと二重で防ぐべき層）。
- `social-announce` の不正起動 → **意図しない SNS 自動投稿**。
- `send-push` の不正起動 → 購読者への**望まない Web Push**。

> 注：`analyze-image` / `analyze-audio` の**再解析（reanalysis）経路**はフロントから `supabase.functions.invoke`（ユーザー JWT）で呼ばれ、webhook secret を持たない。ここは REQ-212 の caller レート制限＋ユーザー認証で守る設計であり、本 REQ の fail-closed 化が**再解析を壊さないこと**を必須条件とする。

## 目的
`WEBHOOK_SECRET` 未設定時の無期限 fail-open を解消し、**本番では秘密未設定＝拒否（fail-closed）**に倒す。あわせて運用面で全 webhook 系関数に `WEBHOOK_SECRET` を設定し、Database Webhook / pg_cron 側の `x-webhook-secret` ヘッダ付与を完了させ、grace period を正式に閉じる。

## 要件

### 機能要件
- [ ] FR-240-01: `requireWebhookSecret()` を、**本番相当環境では未設定を許容しない**よう改修する。判定は明示的な環境フラグで行う（例：`WEBHOOK_SECRET_ENFORCE=1` のとき、`WEBHOOK_SECRET` 未設定なら `WebhookAuthError` を throw）。移行期のみ運用者が明示的にオプトアウトできる形にし、既定を fail-closed 寄りにする。「未設定なら黙って通過」を既定にしない。
- [ ] FR-240-02: grace period を残す場合でも、**未設定での通過は必ず可観測にする**（`console.warn` に加え、Sentry など監視へ計上して「保護されていない呼び出しが本番で発生している」ことを検知可能にする。PII は載せない＝REQ-211 準拠）。
- [ ] FR-240-03: 呼び出し側（10 関数）の catch が `WebhookAuthError` を **401 に変換**する現行契約を維持し、fail-closed 化後も再解析（reanalysis, ユーザー JWT 経路）が 401 で誤って弾かれないこと（`if (!reanalysis) requireWebhookSecret(req)` 相当のガードを確認・維持）。
- [ ] FR-240-04: 運用作業として、全 webhook 系関数に `WEBHOOK_SECRET` を Supabase secrets で設定し、Database Webhook / pg_cron（pg_net）呼び出しに `x-webhook-secret` ヘッダを付与する。設定後に `WEBHOOK_SECRET_ENFORCE` を有効化し、grace period を閉じる。手順は `docs/verification-2026-05-13.md:33-47` / 関連 runbook に沿って記録する。

### 非機能要件
- [ ] NFR-240-01: `WEBHOOK_SECRET` の比較は既存どおり単純一致で可（秘密は十分長いランダム値）。将来必要なら定数時間比較へ拡張できるようヘルパに集約する。
- [ ] NFR-240-02: fail-closed 化は REQ-218（AI killswitch / 課金ガードレール）・REQ-212（レート制限）と多層で機能し、いずれか単独の突破では課金・送信が発生しないこと（多層防御）。
- [ ] NFR-240-03: 変更は `_shared/webhookAuth.ts` に閉じ、10 関数側のロジック改変を最小化する（テスト `_shared/__tests__/webhookAuth.test.ts` を拡張）。

## 受入条件
- [ ] AC-01: `WEBHOOK_SECRET_ENFORCE` 有効かつ `WEBHOOK_SECRET` 未設定の環境で、webhook 系関数を叩くと **401（`WebhookAuthError` 由来）**が返る（素通りしない）。
- [ ] AC-02: `WEBHOOK_SECRET` 設定済み＋正しい `x-webhook-secret` ヘッダ付きの正規呼び出しは 200 で成功する。ヘッダ不一致は 401。
- [ ] AC-03: フロントからの再解析（`analyze-image`/`analyze-audio` の reanalysis）が、fail-closed 化後も認証ユーザーで正常動作する（webhook secret 非要求経路が壊れていない）。
- [ ] AC-04: 本番で `WEBHOOK_SECRET` が全 webhook 系関数に設定され、Database Webhook / pg_cron のヘッダ付与が完了し、監視上「未設定通過」の警告が発生しないこと。
- [ ] AC-05: `_shared/__tests__/webhookAuth.test.ts` に「enforce 時・未設定で throw」「enforce 時・一致で通過」「非 enforce（移行期）挙動」のケースが追加され green。

## 影響範囲
- `supabase/functions/_shared/webhookAuth.ts`（enforce フラグ・可観測化）／`supabase/functions/_shared/__tests__/webhookAuth.test.ts`
- 呼び出し 10 関数（挙動確認・回帰防止。ロジック改変は最小）：`notify-post-status` / `notify-research-adopted` / `notify-weekly-digest` / `notify-dormant-reengage` / `notify-survey-request` / `send-push` / `social-announce` / `enrich-place` / `analyze-image` / `analyze-audio`
- 運用: Supabase secrets（`WEBHOOK_SECRET` / `WEBHOOK_SECRET_ENFORCE`）、Database Webhook / pg_cron のヘッダ設定、`docs/verification-2026-05-13.md` の該当手順
- 関連 REQ: REQ-131（webhook 秘密の導入）、REQ-212（レート制限）、REQ-218（課金ガードレール）、REQ-211（Sentry PII）、REQ-219/234（メール送信系）。

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: 副作用・課金・SNS 投稿・Push を伴う service_role 関数群が、現在アプリ層の認証を素通りできる状態で本番稼働している。実害（メール大量送信・課金膨張・不正投稿）に直結し、かつ修正は `_shared` の 1 ヘルパ改修＋運用の secret 設定で完結する。Critical（REQ-239）に次ぐ優先で塞ぐべき。
