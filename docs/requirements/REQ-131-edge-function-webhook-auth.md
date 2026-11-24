# REQ-131: Edge Function webhook 認証バイパス対策

## これは何か

webhook / pg_net から呼ばれる前提の Edge Function が呼出元の真正性を検証しておらず、
公開済みの Anon Key と curl だけで直叩きできる Critical 級の穴に対する要件定義。
詳細は `REQ-131-edge-function-webhook-auth/` 配下に分割している。

## 目的・背景（要約）

対象は `notify-post-status` / `analyze-image` / `analyze-audio` / `notify-survey-request` の 4 本。
`config.toml` に `[functions.*]` が無く `verify_jwt` の明示指定が無い、webhook 共有秘密の検証が
リポジトリ内に 1 箇所も存在しない、という状態で、呼出側は `payload.record` を信用したまま
SERVICE_ROLE で DB / Auth Admin API / Resend / Gemini を叩いている。REQ-129・REQ-128 と同じ
「Edge Function サーフェスの信頼境界」問題系の最深部にあたる。

## 主要な決定事項（要点）

- 方針は 3 つ: **信頼境界の明示化（直叩き拒否）／ payload を信用せず DB から service-role で再 fetch ／
  CI と migration で webhook secret の往復一致を担保**。
- `supabase/config.toml` に `verify_jwt = true` を明示。`health-gemini` のみ public health endpoint として `false` 明示。
- `_shared/webhookAuth.ts` を新設し、`x-webhook-secret` を**定数時間比較**。不一致は 401 即 return。ローカル環境のみ bypass 可。
- Database Webhook（Dashboard）と pg_net トリガー（migration）の**両方に同じ secret を設定**する。
- payload からは `id`（＋ `old_record.status` 等の変化判定）だけを受け取り、本文に使う値は DB から再取得する。
  通知の冪等性は `notification_log` テーブル新設で担保。
- **Phase 分け**: Phase 1 = FR-131-01〜05（これだけで攻撃面が消える・即時）、
  Phase 2 = FR-131-06〜08（id 再 fetch 化・深層防御）、Phase 3 = FR-131-09〜11（テスト / CI）。
- 存在確認攻撃を防ぐため、再 fetch で row が無い場合は 404 ではなく 200 `{ skipped: 'not_found' }` を返す。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-131-edge-function-webhook-auth/01-background.md) | 背景（検証が存在しない根拠と、なぜ Critical なのか） |
| [02-current-problems.md](REQ-131-edge-function-webhook-auth/02-current-problems.md) | 現状の問題 1〜4（フィッシングメール送信・JWT 素通し・通知スパム・payload 信用の前提崩壊）と再現 curl |
| [03-goals-and-verify-jwt.md](REQ-131-edge-function-webhook-auth/03-goals-and-verify-jwt.md) | 目的 3 点と、機能要件 A: `config.toml` での `verify_jwt` 明示（FR-131-01） |
| [04-webhook-secret.md](REQ-131-edge-function-webhook-auth/04-webhook-secret.md) | 機能要件 B: 共有秘密 `x-webhook-secret` の必須化（FR-131-02〜05・Dashboard / pg_net 両側の設定） |
| [05-payload-refetch.md](REQ-131-edge-function-webhook-auth/05-payload-refetch.md) | 機能要件 C: payload.record を信用しない設計への転換（FR-131-06〜08） |
| [06-tests-ci-and-nfr.md](REQ-131-edge-function-webhook-auth/06-tests-ci-and-nfr.md) | 機能要件 D: テスト / CI（FR-131-09〜11）と非機能要件 NFR-131-01〜04 |
| [07-acceptance.md](REQ-131-edge-function-webhook-auth/07-acceptance.md) | 受入条件 AC-131-01〜08（Given / When / Then 形式） |
| [08-impact.md](REQ-131-edge-function-webhook-auth/08-impact.md) | 影響範囲: 変更対象ファイル一覧と他機能（REQ-128 / REQ-125〜127 等）への影響 |
| [09-priority.md](REQ-131-edge-function-webhook-auth/09-priority.md) | 優先度（Critical）の理由・実害シナリオ 4 件・Phase 分けの推奨 |
