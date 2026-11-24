# 文書とEdge Functionsの入口

[READMEへ戻る](../README.md)。何を知りたいかに応じて、文書の役割を選びます。

## 使う・理解する・変える

| 目的 | 入口 |
|---|---|
| 画面を見て利用の流れを知る | [画面ガイド](../docs/screens/README.md) |
| 設計思想と利用体験を知る | [設計思想](08-design-philosophy.md) |
| コードの責任と処理を読む | [設計ガイド](../docs/architecture/README.md) |
| 現在の挙動と守る契約を確認する | [現行仕様](../docs/current/README.md) |
| 過去の変更要件を調べる | [文書台帳](../docs/README.md) から関連REQへ |
| 変更や新規仕様を進める | [参加ガイド](../CONTRIBUTING.md)、[cc-sdd](../.kiro/README.md) |
| 言葉・色・ロゴを揃える | [ブランドメモ](../docs/brand/brand-memo.md) |

画面ガイドは利用を理解する案内です。細かな現在の仕様は `docs/current`、配置は構造規約を正本とします。
同じ仕様・進捗を、別の文書で重ねて管理しません。

## 運用する

| 作業 | 手順 |
|---|---|
| DB変更を適用する | [migrationと配備の順序](../docs/runbooks/migration-deploy-order.md) |
| Edge Functionを反映する | [Edge配備](../docs/runbooks/edge-function-deploy.md) |
| バックアップ・復元を行う | [backup-restore](../docs/runbooks/backup-restore.md) |
| DB権限と設定を確認する | [Supabase hardening](../docs/runbooks/supabase-hardening-checklist.md) |
| 障害に対応する | [incident](../docs/runbooks/incident/README.md) |

各作業は、対象環境と今回の許可の範囲で実施します。運用手順を読んだことと、本番適用済みであることは別です。

## Edge Functionsは何をする？

Supabase側で動くHTTP関数です。AI分析、地名の付与、メール・Push・外部配信などを受け持ちます。
全14関数の入口・共有処理は [関数一覧](../docs/architecture/edge-functions.md) にあります。

| 例 | 担うこと |
|---|---|
| `analyze-image`・`analyze-audio` | 画像・音声の判定を保存し、条件に応じて自動審査する |
| `enrich-place` | 地名・水系などの付加情報を取得する |
| `notify-*`・`send-push` | 種別ごとの条件で通知を送る |
| `social-announce` | 公開済み記録の外部配信を扱う |

秘密情報はフロントの公開環境変数と分け、Supabase側の設定で管理します。
具体的な設定・反映・確認は [配備runbook](../docs/runbooks/edge-function-deploy.md) に従ってください。
WebのpushだけでDBとEdgeも反映される構成ではありません。[CIと運用](../docs/architecture/operations-ci.md)
