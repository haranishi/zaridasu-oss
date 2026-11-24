# ザリダスの設計とコードを読む

画面の使い方を先に知りたい場合は [画面ガイド](../screens/README.md)、利用体験から設計思想を知りたい場合は [やさしい説明](../../README/08-design-philosophy.md) へ。

このガイドは、ザリダスが何を目指し、どのコードがどの役割を担い、処理がどうつながるかを説明する。
調査基点は `6070714870e5`、確認日は2026-10-17。設計の意図は既存文書・コードのコメントを根拠とし、記録のない意図は断定しない。
コード全行の逐語訳ではなく、責任・入出力・境界・主要な制約から読めるようにまとめた。

## 最初に読む

1. [設計思想](philosophy.md) — なぜ市民の記録、参加の継続、位置の保護を重視するのか。
2. [システム全体](system-overview.md) — ブラウザ、Next.js、Supabase、Workerの分担。
3. [主要な処理の流れ](request-flows.md) — 地図表示から投稿・審査、非公開調査まで。
4. [コードの用語](code-concepts.md) — TSX、hook、RPC、RLSなどの読み方。
5. [ソース索引](source-map.md) — 説明を探したいファイルから入る。

## 領域ごとの案内

| 知りたいこと | 文書 |
|---|---|
| ルート・画面・Provider・状態 | [フロントエンド](frontend.md) |
| ログイン・アカウント・初回案内 | [認証](authentication.md)、[紹介の現行仕様](../current/introduction.md) |
| 地図・投稿・写真・音声 | [地図と投稿](map-posts.md) |
| 図鑑・ランキング・調査依頼・プロフィール | [参加を支える機能](participation.md) |
| 翻訳・テーマ・アクセシビリティ・検索と共有 | [共通UI](localization-ui.md) |
| テーブル・型・migration・研究集計 | [データモデル](data-model.md)、[ER図](data-model-er.md) |
| 公開・本人・管理者の権限 | [認可とプライバシー](authorization.md) |
| 投稿保存・審査・通報・削除 | [投稿と審査](posting-moderation.md) |
| Edge Function全体 | [関数の責任分担](edge-functions.md) |
| メール・Push・AI判定 | [通知とAI](notifications-ai.md) |
| 非公開スポット・調査計画・希少種 | [フィールドワーク](fieldwork.md) |
| 公開データセット・調査依頼 | [データ公開と依頼](dataset-surveys.md) |
| 水域探索・公開記録集計・Rust/Wasm | [水域](water-geometry.md) |
| PWA・端末保存・未送信・画像Worker | [オフライン](offline.md) |
| 汎用処理・型・エラー・計測 | [共通コード](shared-code.md) |
| 外部サービスの用途と障害時の扱い | [外部連携](external-services.md) |
| ビルド・CI・デプロイ・バックアップ | [運用](operations-ci.md) |
| Cloudflare移行の思想・DB/認証/メール・障害と手順（未実施） | [移行SDD](../../.kiro/specs/cloudflare-migration/brief.md) |
| テストの分担と実行条件 | [検証](validation.md) |
| 変更時に読むもの・更新先 | [変更ガイド](change-guide.md) |

## 文書の使い分け

ここは実装を理解するための案内。現在の挙動と守る契約は [docs/current](../current/README.md)、配置規約は [構造規約](../project-structure-conventions.md) が正本となる。
変更の理由と経緯は既存REQ、新しい変更の要件・設計・タスクは [.kiro](../../.kiro/README.md) に残す。
挙動を変えたら対応する現行仕様と、このガイドの該当する説明・索引を更新する。
実際の本番設定・デプロイ済みバージョンは、ソースからは確定できない。運用手順に従って別途確認する。
