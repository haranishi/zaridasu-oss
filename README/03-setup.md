# 開発環境を動かす

[READMEへ戻る](../README.md) · [設定とスクリプト](04-env-and-scripts.md) · [変更に参加する](../CONTRIBUTING.md)

本番を使わずに確認する場合は [ローカル環境と架空データの手順](../docs/oss/local-development.md) を使えます。

## 用意するもの

- **Node.js 22とnpm**：CIと同じ条件を使い、`npm ci` でロックファイルの依存を再現する。
- 開発用Supabase：用意済みの開発プロジェクト、または手元のCLI・コンテナ環境。

フロントエンドを動かすために、最初からAI・メール・Pushのすべてを設定する必要はありません。
対象の機能を確認するときに、それぞれの設定を追加します。

## 1. コードと依存を準備する

```sh
git clone https://github.com/haranishi/zaridasu-oss.git
cd zaridasu-oss
npm ci
cp .env.example .env.local
```

## 2. 開発用の接続先を設定する

`.env.local` に設定します。ここに書く値をREADMEやPRへ貼り付けません。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

起動に必須なのはSupabaseのURLと公開キーの2つです。`NEXT_PUBLIC_APP_URL` は共有URL・canonical等を開発環境に合わせます。
service roleやsecret keyは公開キーとは別です。`NEXT_PUBLIC_*` に入れません。
DB側にも、このプロジェクトの定義・権限・必要な設定を用意します。[DB定義とmigration](../supabase/migrations/README.md)

## 3. 起動する

```sh
npm run dev
```

`http://localhost:3000` で開きます。最初は [地図と写真](../docs/screens/map.md)、設定後は [認証・投稿](../docs/screens/account.md) など、対象の操作を確認します。
起動できることと、認証・保存・外部連携がすべて動くことは別の確認です。

## 手元でSupabaseを動かす場合

[公式CLI手順](https://supabase.com/docs/guides/local-development/cli/getting-started) でCLIと対応する実行環境を用意します。
このリポジトリには `supabase/config.toml` があるため、初期化済みのプロジェクトとしてルートから操作します。

```sh
npm run local:start
npm run setup:local
```

起動時に表示されるローカルのAPI URL・公開キーを `.env.local` に設定します。
現在のスキーマから独立環境を作ります。詳細と過去migrationの制約は [ローカル手順](../docs/oss/local-development.md) を確認してください。
生成したローカルDBを初期化する操作は `supabase db reset --workdir .local-dev --local` です。実行前に対象と必要なデータを確認してください。
サービスのポートは [config.toml](../supabase/config.toml) とCLI出力を正にし、認証メールもローカルのメール確認UIで見ます。

## 認証・任意機能を確認する場合

Supabase側でCAPTCHAが有効なら、`NEXT_PUBLIC_TURNSTILE_SITE_KEY` とサービス側の設定を揃えます。[CAPTCHA手順](../docs/security/captcha-setup.md)
Google認証・メールのredirect許可なども、接続先の開発プロジェクトで準備します。
AI・通知・地名付与の識別子は [環境変数](04-env-and-scripts.md)、Edge側の反映は [関数と運用](06-docs-and-edge-functions.md) へ。
ブラウザテストは [E2E手順](05-e2e-and-directory-structure.md) のテスト用環境で実行します。
