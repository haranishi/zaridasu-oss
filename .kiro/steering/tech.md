# 技術方針と検証の入口

更新日：2026-10-17。根拠：[技術概要](../../README/02-features-and-stack.md)、[セットアップ](../../README/03-setup.md)、[検査ゲート](../../scripts/precheck.mjs)。
実行場所と接続は [全体図](../../docs/architecture/system-overview.md)、境界の検証は [検証ガイド](../../docs/architecture/validation.md) を参照する。

## 構成と技術判断

Next.js App RouterとTypeScriptを中心とするWebアプリ。Reactの画面とサーバー側の処理を、公開・認証・管理の境界に合わせて分ける。
Next.jsのAPIや慣習は、インストール済みパッケージのドキュメントを確認してから変更する。
Node.jsと依存導入はREADME・CIの基準に合わせ、依存の正確な状態は `package.json` とロックファイルから確認する。

DB・認証・StorageはSupabaseを使う。アプリ側の表示制御だけで権限を成立させず、既存のRLS・GRANT・サーバー認可を引き継ぐ。
公開表示と非公開調査は別の経路として扱い、詳細の正本は `docs/current/` にある。

将来のCloudflare移行は[インフラ方針](infrastructure.md)と[移行仕様](../specs/cloudflare-migration/brief.md)を参照する。
現時点は設計案で、移行は未実施。Turso/D1の採用とSupabaseの縮小は検証後に判断する。

地図の水域計算にはRust/WasmとWorkerによる補助経路がある。通常のアプリビルドでは同梱Wasmを検証し、Rust変更時は [専用手順](../../rust/water-geometry/README.md) に従う。
補助経路が使えないときの既存処理への切り替えと、古い検索結果を反映しない契約を維持する。

## 品質の基準

TypeScriptの型、ESLint、4言語の翻訳、スキーマと型、公開経路の整合を既存の検査で確認する。
テストはVitestとPlaywrightを使い、変更した挙動や境界を確かめる。E2Eで本番データに書き込まない。
画面や操作の変更では、テストに加えて実際の起動・操作・対象画面を確認する。

検査コマンドの正本は `package.json`、まとめて実行する入口は `scripts/precheck.mjs` とCI。
文書・設定だけの変更では、変更に必要な参照・構文・差分の確認に絞る。
検証環境の不足で実施できなかった確認は、そのまま未確認として報告する。
