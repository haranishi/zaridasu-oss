# コード全体の索引

調査基点 `6070714870e5` のGit管理ファイルを、実装へのリンクと担当説明へ対応付けた。
対象は **797ファイル**。画面・共有処理・DB・Edge・Rust・スクリプト・テスト・配信アセット・主要設定を含む。

## 探し方

ファイル名を知っている場合は該当領域の索引を開き、説明のリンクをたどる。
何を読むべきか分からなければ [全体図](system-overview.md) と [処理の流れ](request-flows.md) から入る。
索引の役割は領域単位の分類。個々の関数や状態の契約は、その領域の説明と実装を併せて読む。

| 領域 | ファイル数 |
|---|---:|
| [ルート設定・CI・補助ツール](source-tooling.md) | 31 |
| [配信コード・公開アセット](source-public.md) | 28 |
| [Rust・Wasm](source-rust.md) | 7 |
| [生成・検査・運用スクリプト](source-scripts.md) | 24 |
| [型・翻訳・実行入口](source-types-entry.md) | 16 |
| [URL・ページ・HTTP入口 1/2](source-app-01.md) | 72 |
| [URL・ページ・HTTP入口 2/2](source-app-02.md) | 3 |
| [画面部品 1/2](source-components-01.md) | 72 |
| [画面部品 2/2](source-components-02.md) | 64 |
| [Context・Hook](source-state.md) | 59 |
| [fieldwork機能](source-feature-fieldwork.md) | 67 |
| [water機能](source-feature-water.md) | 27 |
| [共有ロジック・データアクセス 1/2](source-lib-01.md) | 72 |
| [共有ロジック・データアクセス 2/2](source-lib-02.md) | 32 |
| [ページ本体](source-views.md) | 47 |
| [DB定義・検査・設定](source-database.md) | 29 |
| [Edge Functions](source-edge.md) | 51 |
| [DB migration](source-migrations.md) | 67 |
| [E2E・検証データ](source-tests.md) | 29 |

## 対象と更新方法

`git ls-files` で管理されている `src/`・`scripts/`・`supabase/`・`rust/`・`tests/`・`public/` の非Markdownファイルを対象とする。
加えてルートの主要設定、CI・Issue用YAML、CODEOWNERS、工程用ツールを含む。
画像は公開アセット、lockファイルは依存固定、テストは検証担当の説明へまとめた。
既存の文書群は [docs台帳](../README.md)、migrationの経緯は [既存索引](../../supabase/migrations/README.md) を参照する。
依存パッケージの内部、生成キャッシュ、未追跡ファイル、実際の環境変数・秘密情報は対象外。

追加・移動・削除に合わせて該当ページを更新する。100行を超える場合は番号付きで分割する。
意味が変わる場合は、ファイル名だけでなく担当する説明と現行仕様も更新する。
