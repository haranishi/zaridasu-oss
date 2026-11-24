# 環境変数と実行コマンド

[READMEへ戻る](../README.md) · [セットアップ](03-setup.md) · [検証ガイド](../docs/architecture/validation.md)

## 必要な設定を選ぶ

設定項目と用途は [環境変数の見本](../.env.example)、接続する処理は [外部連携](../docs/architecture/external-services.md) を参照してください。

| 目的 | 主な識別子・設定先 |
|---|---|
| アプリの起動 | `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`。ブラウザ用の公開接続設定 |
| ローカルのURL | `NEXT_PUBLIC_APP_URL`。共有・canonical等を開発用URLへ合わせる |
| 認証・CAPTCHA | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`とSupabase側の認証設定 |
| AI・メール・地名・外部配信 | Gemini・Resend等の鍵はEdgeの設定へ。機能ごとの必須条件を確認 |
| Push | ブラウザの公開VAPID keyと、EdgeのVAPID設定を分ける |
| 計測・監視 | GTM・Sentry等。設定がある場合の収集条件を実装で確認 |
| CI・本番運用 | GitHub/Vercel/Supabaseの各設定。ローカルの公開変数へ秘密を置かない |

`.env.local`や各サービスの秘密設定をGitへ取り込みません。Edgeの設定・反映は [専用手順](../docs/runbooks/edge-function-deploy.md) に従います。

## まとめて確認する入口

`npm run precheck` は型・lint・翻訳・単体・監査・Edgeなど、ローカルの検査をまとめます。
`npm run precheck:full` はビルド・容量・E2Eも含みます。既定は最初の失敗で止まり、`npm run precheck -- --all` は最後まで結果を集めます。
Node以外のツール・環境設定・通信が必要な検査もあります。実行内容の正本は [precheck.mjs](../scripts/precheck.mjs) です。
RLS・型生成・本番migration照合・LighthouseなどのCI検査を、このコマンドだけですべて代替するわけではありません。

## package.jsonの全スクリプト

| コマンド | 何をするか |
|---|---|
| `npm run predev` | 開発用Service Workerを生成。devの前に自動実行 |
| `npm run dev` | 開発サーバーを起動 |
| `npm run prebuild` | 同梱Wasmを検証し、Service Workerを生成。buildの前に自動実行 |
| `npm run build` | 本番用のNext.jsをwebpackでビルド |
| `npm run start` | ビルド済みアプリを起動 |
| `npm run lint` | ESLintを警告ゼロ基準で実行 |
| `npm test` | Vitestを1回実行 |
| `npm run test:watch` | Vitestを監視モードで実行 |
| `npm run test:coverage` | カバレッジ付きの単体テスト |
| `npm run type-check` | TypeScriptの型検査 |
| `npm run size` | バンドル容量の予算検査 |
| `npm run size:routes` | ルートごとの初回JS予算の検査 |
| `npm run bench:posts` | 合成投稿の転送量を測定 |
| `npm run bench:map` | 指定した画面と合成投稿で地図の描画を比較 |
| `npm run analyze` | Bundle Analyzerを有効にしてビルド |
| `npm run e2e` | Playwrightのブラウザテスト |
| `npm run e2e:install` | Chromiumと必要なOS依存を準備 |
| `npm run eval:ai` | 実APIを使うAI評価。通信・課金の条件を確認して使う |
| `npm run cost:ai` | AI利用コストの集計 |
| `npm run i18n:check` | 4言語の翻訳キー照合 |
| `npm run schema:check` | SQLの列挙値と型の同期確認 |
| `npm run auth-route:check` | 禁止した認証URLへの遷移を検査 |
| `npm run private-tables:check` | 非公開調査表の公開経路への混入を検査 |
| `npm run build:sw` | Service Workerを単独生成 |
| `npm run wasm:build` | RustからWasmを生成 |
| `npm run wasm:verify` | 同梱Wasmとソース・配布設定の整合確認 |
| `npm run wasm:check` | Wasmを再ビルドして配布物との一致を確認 |
| `npm run bench:water` | 合成形状で水域計算を測定 |
| `npm run audit` | 本番依存のhigh以上の監査 |
| `npm run audit:all` | 開発依存を含む監査。結果は情報扱い |
| `npm run secrets:scan` | Git管理対象の秘密情報を検査 |
| `npm run secrets:protect` | ステージ済み変更の秘密情報を検査 |
| `npm run precheck` | ローカル検査をまとめて実行 |
| `npm run precheck:full` | ビルド・容量・E2Eを含めた検査 |

実行時間は環境とキャッシュで変わります。単体・ブラウザ・DB・Edge・Rustが確かめる範囲は [検証ガイド](../docs/architecture/validation.md) で確認できます。
通常は `dev`・`build` を使い、対応するpre処理を個別に二重実行する必要はありません。
