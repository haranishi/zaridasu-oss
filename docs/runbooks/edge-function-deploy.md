# Supabase Edge Function デプロイ手順書

> 参照要件: REQ-127 (FR-127-12)
> 所要時間: **30 分以内**（全関数デプロイ + 検証）

---

## これは何か

Supabase Edge Function を本番へ反映するための手順書。いつ実行するか、事前確認、単一 / 全関数の
デプロイ、secrets の追加、デプロイ後検証、ロールバックの考え方までを扱う。

## 目的・背景

**`git push` だけでは Edge Function は本番反映されない。** CLI からの deploy が必要で、これを
忘れると本番が旧バンドルのまま静かに残る。過去に `_shared/` だけを変更したコミットが CI の
遅延検知を素通りし、本番の全関数が旧バンドルのまま放置された事故があったため、現在は
`_shared/` の変更を全関数へ自動展開して CI が検知する（REQ-298 FR-298-01/02）。

## 主要な決定事項（要点）

- 本番 project ref は **`edxmkqmjzbarjdgnkcvc`**。
- **`_shared/` を変更したら「全関数デプロイ」**（手順 B）。`_shared/` は単体デプロイできない。
  現行CIはPRで遅延をwarningとして検知する。main pushではこのジョブは動かないため、マージ後も別途デプロイ状況を確認する。
- **`.deploy-ignore` の除外を外さない。** `notify-dormant-reengage` / `notify-weekly-digest` は
  「配信しない」判断で載っており、デプロイすると pg_cron 再開時に意図しないメールが飛ぶ。
- **secrets は Dashboard で設定する。** `supabase secrets set` は CLI 履歴に値が残るため非推奨。
- **Supabase に「過去バージョンへ切替」する UI は無い。** ロールバックは `git revert` して再デプロイする以外に手段がない。

## 各部品

- [01-when-to-use-and-prerequisites.md](./edge-function-deploy/01-when-to-use-and-prerequisites.md) — いつ使うか（マージ後 / CI の遅延警告 / 障害対応）と前提（CLI・ログイン・project ref・必要ロール）。
- [02-pre-checks-and-shared-fanout.md](./edge-function-deploy/02-pre-checks-and-shared-fanout.md) — 事前確認（本番デプロイ状況の取得、変更内容の確認）と `_shared/` 変更が全関数へ波及する理由・CI 検知の経緯（2026-08-03 の変更点）。
- [03-deploy-steps.md](./edge-function-deploy/03-deploy-steps.md) — デプロイ手順 A（単一関数）/ B（全関数一括のループと `.deploy-ignore` の扱い）/ C（新規 secrets の設定）。
- [04-post-deploy-verification.md](./edge-function-deploy/04-post-deploy-verification.md) — デプロイ後検証（`UPDATED_AT` の確認、起動ログ、機能疎通と `ai_call_logs` の確認クエリ）。
- [05-rollback-troubleshooting-and-links.md](./edge-function-deploy/05-rollback-troubleshooting-and-links.md) — ロールバックの方針（参照すべき別 runbook・revert 再デプロイ）、トラブルシュート表、関連要件と対象コード。
