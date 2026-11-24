# REQ-309: Edge Function の共通化と外部呼び出しの堅牢化

これは何か: Edge Function 14本に残る重複実装・監視の空白・外部呼び出しの無防備さをまとめて塞ぐ要件定義（P1 / Medium / バックエンド / 提案・未実装）。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

REQ-287 は service-role クライアント生成を `_shared/supabaseAdmin.ts` へ集約し、自動導出による不変条件テストで退行を防ぐ形を確立した。しかし同じ整理が必要な共通部品が未移行のまま残っている（`escapeHtml` が6実装、`SPECIES_LABELS` が7箇所に分散し**すでに乖離**）。加えて Edge Function には集約監視が無く、外部API呼び出しにタイムアウトも無い。本要件は「集約パターンの適用範囲拡大」「外部呼び出しを止められる状態にする」「秘密値・PIIの漏出面を閉じる」「依存と定期実行の穴を埋める」の4系統を扱う。

## 主要な決定事項（要点）

- **共通化**: `escapeHtml` を `_shared/mailer.ts` の単一実装へ統一（FR-309-01）。ラベルは `_shared/labels.ts`（新規）へ集約し、`SPECIES_LABELS`（2値）と `SURVEY_SPECIES_LABELS`（`unknown` を含む3値）を**別定数として明示的に分ける**（FR-309-02）。いずれも自動導出方式の不変条件テストで恒久固定する。
- **可観測性**: `_shared/observability.ts`（新規）を設け、`webhook_secret_unset_passthrough`（無認証通過）と Resend 連続失敗をアラート化（FR-309-03）。
- **堅牢化**: `_shared/fetchWithTimeout.ts`（新規）で全外部呼び出しを統一（Resend/Web Push 10秒、集約SNS API 15秒）。バッチは小並列（5〜10）＋バッチ全体デッドラインへ変更（FR-309-04）。
- **PII/秘密値**: `notify-post-status` の Resend エラー生出しを redact＋固定文言化（FR-309-05）、`analyze-image` 最終catch（FR-309-06）、`_shared/mailer.ts` の throw（FR-309-07・1箇所の修正で3関数が救われる）。
- **依存・定期実行**: Deno 依存の月次更新 workflow（FR-309-08）、`backup.yml` の Supabase CLI をピン（FR-309-09）、`cost:ai` の週次実行と `eval:ai` の手動 dispatch 整備（FR-309-10）。
- **優先度**: FR-309-05/07 が最優先（現に REQ-211 違反が発生中）。FR-309-06/08/09/10 は P2。
- 未確定6件（`escapeHtml` の置き場所、監視の実装手段、並列数など）は**実装着手前に決める**。

## 分割ファイル

- [01-summary.md](REQ-309-edge-function-shared-consolidation-and-resilience/01-summary.md) — 作成日・優先度・状態・関連REQ一覧 ＋ 0. 要件サマリー
- [02-background-a-e.md](REQ-309-edge-function-shared-consolidation-and-resilience/02-background-a-e.md) — 背景 問題A〜E（escapeHtml 6実装 / SPECIES_LABELS 7箇所の乖離 / 集約監視なし / タイムアウトなし / notify-post-status のPII生出し）
- [03-background-f-j.md](REQ-309-edge-function-shared-consolidation-and-resilience/03-background-f-j.md) — 背景 問題F〜J（analyze-image の redact漏れ / mailer の throw / Deno依存の更新経路なし / backup.yml の `latest` / `eval:ai`・`cost:ai` 未配線）
- [04-functional-requirements.md](REQ-309-edge-function-shared-consolidation-and-resilience/04-functional-requirements.md) — 機能要件 FR-309-01〜10（共通化 / 可観測性・堅牢化 / 漏出面 / 依存・定期実行）
- [05-acceptance-criteria.md](REQ-309-edge-function-shared-consolidation-and-resilience/05-acceptance-criteria.md) — 受入基準 AC-01〜14
- [06-open-questions.md](REQ-309-edge-function-shared-consolidation-and-resilience/06-open-questions.md) — 未確定事項6件の表 ＋ 要確認（レート制限・Sentry Deno SDK・デッドライン値など未検証項目）
- [07-impact.md](REQ-309-edge-function-shared-consolidation-and-resilience/07-impact.md) — 影響範囲（変更対象コードの一覧、他要件 REQ-287/280/211/288/279 への影響）
- [08-priority-breakdown.md](REQ-309-edge-function-shared-consolidation-and-resilience/08-priority-breakdown.md) — 優先度の内訳（FRごとの P1/P2 と理由）
