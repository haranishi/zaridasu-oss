# E2Eとコードの置き場所

[READMEへ戻る](../README.md) · [検証の役割分担](../docs/architecture/validation.md)

## ブラウザで操作を確かめる

E2EはPlaywrightとChromiumを使い、画面の表示・入力・遷移を検査します。
初回やPlaywrightの更新後は、必要なブラウザを準備します。

```sh
npm run e2e:install
```

テスト用のダミー接続先で実行します。

```sh
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key-for-ci-build \
npm run e2e
```

既定では、本番ビルド後に `127.0.0.1:3100` で専用サーバーを起動します。既存の3000番の開発サーバーは再利用しません。
管理者のテストは固定の偽トークンと [テスト専用transport](../tests/e2e/fixtures/admin-auth-transport.mjs) を使い、実際の管理者アカウントを必要としません。
このtransportを通常のビルド・配備へ読み込みません。通信モックを含む検査の範囲は [検証ガイド](../docs/architecture/validation.md) で確認できます。

`E2E_BASE_URL` を指定した場合は自動起動を省くため、テスト専用サーバーを準備した場合に使います。

```sh
E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e
```

既定構成はChromiumのみです。Safariや実機での圏外・Push等の確認とは分けます。
コマンドの正本は [playwright.config.ts](../playwright.config.ts) と [package.json](../package.json) です。

## ファイルの役割から探す

| 場所 | 担うもの |
|---|---|
| `src/app` | URL・レイアウト・metadata・HTTPの入口 |
| `src/views` | ページ本体と操作の接続 |
| `src/components` | 共通UI・機能別の部品・モーダル |
| `src/context`・`src/hooks` | 認証や設定の共有、取得・入力・操作の状態 |
| `src/lib`・`src/types` | データアクセス・検証・変換・型 |
| `src/features/fieldwork`・`src/features/water` | 非公開調査と水域の機能単位の処理 |
| `src/locales` | ja/en/ko/zhの翻訳 |
| `src/workers`・`rust/water-geometry` | 画像や水域計算の別スレッド処理・Wasm |
| `public`・`scripts` | 配信アセット、生成・検査・運用のスクリプト |
| `supabase` | schema・migration・権限テスト・Edge・メールテンプレート |
| `tests/e2e`・`tests/fixtures` | ブラウザテストと評価用データ |
| `docs`・`.kiro` | 画面・設計・現行仕様・履歴と、新規仕様の開発手順 |

具体的なコードは [ソース索引](../docs/architecture/source-map.md)、新しいコードの配置は [構造規約](../docs/project-structure-conventions.md) を参照してください。
