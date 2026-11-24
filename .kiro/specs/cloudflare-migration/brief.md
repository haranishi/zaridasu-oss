# Cloudflare移行はWeb・メディア・業務DBを分けて進める

作成：2026-10-30。2026-11-14、本人が移行の実行を依頼。[実行契約](execution-20261114.md)に従い、Web候補とDB試作を進める。
初回基点：`f820066`。認証・メール・追加障害の調査基点：`develop` の `ab4fd3f`。本番設定は未照合。

## 目指す状態

ザリダスをCloudflare Workersで運用し、写真・音声はR2、業務データはWorkers API経由で扱う。
業務DBはTursoを第一検証候補、D1を対案とする。採用は同じ権限・整合性試験と費用・性能の測定で決める。
Supabaseは移行中のDB・Auth・Storage・Edge Functionsとして残し、一括置換を避ける。
撤去後の認証はBetter AuthをWorkersで動かす案、メールはResend継続を基本案として検証する。
Cloudflare Email Sendingも比較する。Turso/D1だけでAuth・Storage・Edge全体を代替できるとは扱わない。

## 判断の背景

運用の中心をCloudflareに寄せ、保存先を用途で選び直す。移行だけを目的とした全面書換えはしない。
研究記録の継続性、非公開位置の保護、単独運用で復元できることを、無料枠や製品数より優先する。
DBを替える場合は、現在PostgreSQLにある認可をWorkers APIへ移す責任も引き受ける。
コード上ではPostGISとRealtime購読は未検出。主な課題はPostgREST直呼び、RPC、権限、通知の移植にある。

## この仕様に含めるもの

- 現状依存の調査、DBの比較、責任境界と非公開データの保護方針。
- 必要なアカウント・設定・検証環境、段階移行、切替・復旧手順。
- 将来の実装タスクと、開始前に決める予算・停止時間・採用技術。
- 追加依頼に基づく認証の完全移行、認証/通知メール、14の非同期処理、残存障害と廃止ゲート。

初回設計PRは文書限定だった。現在の実装依頼でその範囲を更新するが、
実データ移送・本番切替・契約変更は実行契約の合格条件と本人の判断を経る。

## 読む順序

| 文書 | 決めること |
| --- | --- |
| [requirements.md](requirements.md) | 守る条件と受け入れ基準 |
| [design.md](design.md) | 移行先の構成・認証・処理の責任 |
| [database-decision.md](database-decision.md) | Turso・D1・Supabaseの比較と採用条件 |
| [auth-design.md](auth-design.md)・[auth-cutover.md](auth-cutover.md) | 認証基盤・既存利用者/権限・再認証・復旧 |
| [email-design.md](email-design.md) | 認証/通知メール、配信停止、到達と業者比較 |
| [background-processing.md](background-processing.md)・[migration-blockers.md](migration-blockers.md) | 全14処理の代替と移行障害の解消条件 |
| [research.md](research.md) | 実装根拠と公式仕様の確認先 |
| [migration-plan.md](migration-plan.md) | 準備・段階・実施前の判断 |
| [cutover-and-rollback.md](cutover-and-rollback.md) | 停止・照合・切替・切り戻し |
| [tasks.md](tasks.md) | 完了した文書作業と未着手の実装 |
| [verification.md](verification.md) | 文書の検証証拠と未確認事項 |

## 既存仕様を引き継ぐ

[技術方針](../../steering/tech.md)、[セキュリティ方針](../../steering/security.md)、
[現行プライバシー](../../../docs/current/privacy.md)、[現地調査](../../../docs/current/fieldwork.md)、
[security-hardening](../security-hardening/brief.md)を不変条件の根拠とする。
現在の説明は `docs/current/` に残し、未実装の移行案で書き換えない。
