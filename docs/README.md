# docs/ 台帳（REQ-282 FR-282-B5）

`docs/` 配下の各ディレクトリの役割と「どの文書が正か」の一覧。迷ったらここから辿る。

## ディレクトリの役割

| 場所 | 役割 | 正となる文書 |
|---|---|---|
| `screens/` | 利用者の目的から、各画面の開き方・見方・操作・次の遷移を知る案内 | [screens/README.md](screens/README.md)。細かな現在の契約は `current/` を参照 |
| `architecture/` | 設計思想・コードの役割・処理の流れとファイル索引。実装を理解するための案内 | [architecture/README.md](architecture/README.md)。現在の仕様と配置規約はそれぞれの正本を参照 |
| `current/` | **いまの仕様**（領域ごとに 1 枚）。実装前にここを読む。REQ 文書は「そのとき何を変えたか」の履歴で、現在の姿を知るには 300 本超を読み漁ることになるため分けた | `current/README.md` から辿る |
| `requirements/` | **要件定義（REQ-NNN-slug.md）と監査インデックス**。REQ の現況（起票/実装済み）は各インデックスと各REQ文書の状態欄が正 | `REQ-239-251-…-index.md`・`REQ-269-281-audit-2026-07-17-index.md` ほか各REQ |
| `runbooks/` | 運用手順書（バックアップ/復元・鍵ローテーション・Web Push・メール認証・コストガードレール等）。`incident/` はインシデント対応（01〜05・連絡先・証拠保全） | 各runbook |
| `planning/` | **現役の計画文書のみ**（優先度バックログ・セットアップ手順）。旧世代は archive へ | `priority-backlog.md` |
| `security/` | セキュリティ個別トピック（CAPTCHA・Sentryスクラブ・サーバー認可監査） | 各文書 |
| `brand/` | ブランド・デザインガイド | `brand-memo.md`・`design-guide.md` |
| `philosophy/` | プロダクトの背景・思想 | `background.md` |
| `archive/` | **歴史的文書（更新しない）**。旧進捗トラッカー・旧世代要件・完了済み移行計画・当時のスナップショット。各ファイル冒頭にアーカイブ注記あり | （参照のみ） |

## ルート直下の文書

| ファイル | 内容 |
|---|---|
| `project-structure-conventions.md` | `src/` の配置・命名規約（REQ-266で確立。**新規コードはこれに従う**） |

## 関連（docs/ 外）

- `.kiro/README.md` — cc-sddの開発手順。既存REQを引き継ぎ、新規仕様は `.kiro/specs/`、共通の判断基準は `.kiro/steering/` に置く。実装後の現在の挙動は引き続き `docs/current/` を更新する。
- `supabase/migrations/README.md` — migration 全58本の索引・適用状況・運用ルール
- `README.md`（リポジトリルート） — セットアップ・技術スタック・ディレクトリ構成
- `.env.example` — 環境変数の網羅リスト（用途コメント付き）

## 運用ルール

- REQ の進捗を別ファイルで二重管理しない（過去の `req-implementation-progress.md` 等は archive 済み）。
- 文書を廃止するときは削除せず `archive/` へ移動し、冒頭にアーカイブ注記（日付・後継の参照先）を付ける。
- `archive/` 内の文書は編集しない（歴史的スナップショットとして保全）。
