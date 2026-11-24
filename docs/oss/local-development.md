# 本番データを使わずに開発する

対象は開発に参加する人です。サービスを使うだけなら [ザリダス](https://zaridasu.com/) をブラウザで開いてください。
Node.js 22、npm、Supabase CLI v2、Docker互換環境を用意します。
CLI v3は動作が変わるため、検証前に置き換えないでください。[公式のローカル開発手順](https://supabase.com/docs/guides/local-development/cli-workflows)

## 1. 依存を導入する

```sh
git clone https://github.com/haranishi/zaridasu-oss.git
cd zaridasu-oss
npm ci
```

Next.jsのlint用アダプターは `tools/next-eslint-glob` に同梱しています。
別の開発者のディレクトリや本番の環境ファイルをコピーする必要はありません。

## 2. ローカルのDB・認証を起動する

Docker互換環境を起動してから、プロジェクトのルートで実行します。

```sh
npm run local:start
npm run setup:local
```

`local:start`は現在の`supabase/schema.sql`を`.local-dev`へコピーし、専用のローカルmigrationとして初期化します。
CIの権限再適用リストと既存のセキュリティ強化migrationも、その後に適用します。
過去のmigrationは空のDBで途中失敗するため、この開発経路では再実行しません。本番の履歴は変更しません。
生成済みsnapshotと現行schemaが異なるときは、自動で上書き・DB初期化せずに停止します。

`setup:local` はCLIからローカルのURLと公開キーだけを取得し、`.env.local`を作ります。
接続先がlocalhost等でなければ拒否します。既存の`.env.local`は上書きしません。
既存ファイルがある場合は自分で保存内容を確認し、本番URLや管理キーを開発に流用しないでください。
ローカル環境の配信メールはmailpit等のローカル確認UIで見ます。実際の宛先には送信しません。

外部連携が不要な確認では `npm run local:prepare`の後、`supabase start --workdir .local-dev --exclude logflare,vector,supavisor,edge-runtime` でも開始できます。
この構成ではEdge Functionsの動作を確認したことにはなりません。

## 3. 架空のデータを投入する

```sh
npm run seed:local
npm run dev
```

`seed:local`もループバック接続だけを許可します。本番からデータを取得しません。
`demo@example.test` / `Local-Demo-Only123!` のデモ会員と、明示的に架空と記載した投稿2件を作ります。
これはローカル専用の公開されたテスト資格情報です。外部公開する環境では使用しないでください。
同じコマンドを再実行すると、同じIDの架空投稿を更新します。

`http://localhost:3000`でログイン・地図・投稿一覧を確認します。
開発時は設定したローカルAPI originの通信・画像・音声を許可します。本番ではHTTPのローカル接続やlocal IPの画像取得を許可しません。
既定ではAI、メール配信、Push、Googleログイン等の外部連携を設定しません。
AI等を追加する場合は自分の開発用資格情報を使い、Webhook認証も設定します。[通知とAI](../architecture/notifications-ai.md)
`WEBHOOK_SECRET_ENFORCE=true`を使い、本番用の秘密や本番Vaultのコピーを持ち込みません。

## 4. 検証する

```sh
npm run precheck
npm run build
```

画面を変えたときは [E2Eの手順](../../README/05-e2e-and-directory-structure.md)も使います。
本番の接続先を使った試験や実際の利用者へのメール送信で確認しません。
DBを初期化する場合は `supabase db reset --workdir .local-dev --local` が対象のローカルデータを消す操作であることを確認してから実行します。
