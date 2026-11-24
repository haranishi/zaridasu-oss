# PRを検査し、本番運用を分ける

このリポジトリの[ci.yml](../../.github/workflows/ci.yml)は`main/develop`向けPRを検査する。
mainはソースのリリース用、developは統合先で、自動配備はない。参加者のPRから本番へ配備できない。
本番照合・Vercel配備の `production.yml` とバックアップの `backup.yml` は元の運用側に残し、このリポジトリから除いている。
`develop`へのpushだけではCIは走らない。ワークフローの定義と、GitHub側の必須チェック設定は別物である。
設定とCIの確認状況は [公開の状況](../oss/release-status.md) を参照する。以下の本番・バックアップの説明は元repoの設計記録である。

## PRで検査するものと情報だけのものを分ける

| ジョブ | 実行条件と判定 |
|---|---|
| `test` | PR。lint、型、翻訳キー、SQL許容値と型、認証経路、非公開表、ビルド、coverage、独立lockのlocal Turso/D1検査を失敗判定 |
| `rust-geometry` | PR。Rust fmt/clippy/testと配布Wasmの再ビルド一致 |
| `e2e` | PR。既存Chromium E2E後、Cloudflare fixture build/dry-run・型・workerd/browser検査。失敗時trace・画像を保存 |
| `perf-budget` | base=`develop`のPRのみ。size-limit、ルート総量、Lighthouse |
| `edge-functions` | PR。Deno依存をlock付きで取得後、全TSの型検査とcached-onlyテスト |
| `rls-tests` | PR。Postgres＋pgTAP、Auth/Storage/Vault/pg_netスタブで権限検査 |
| `schema-drift` | PR。schema.sqlの適用と型生成のsmoke。コミット済み型との差分は情報のみ |
| `audit` | PR。本番依存high以上とDB試作lockのlow以上は失敗。root開発依存込み監査は情報のみ |
| `gitleaks` | PR。秘密の混入を検査。PR commits API用のread権限も付ける |
| `dependency-review` | public repositoryのPRのみ。新規依存high以上を失敗判定 |

このリポジトリのPRは本番DBやProduction Environmentへ接続しない。本番用のSecrets・Environment・配備連携を引き継がない。
全ジョブは既定read権限、同じrefの旧実行はcancelする。fork PRへ秘密を渡す`pull_request_target`は使わない。
必須8名はtest/e2e/rls-tests/edge-functions/schema-drift/rust-geometry/audit/gitleaksを維持する。
Cloudflare検査の境界と再現方法は[preview手順](../runbooks/cloudflare-preview.md)へ。

## 元のprivate運用ではアプリ・DB・Edgeを別々に配備する

以下はこのリポジトリから除いた本番workflowの設計記録であり、このrepoのmainへのpushで実行される処理ではない。
元repoではmigration集合・内容ハッシュ・索引件数をmain pushで照合し、資格情報欠落も失敗として配備を止める。deploy-lagの認証不足によるskipを一致の証拠にしない。

1. schema、RLS、既存データとの互換性をPRで確かめる。既存migrationを編集せず、新しい変更を追加する。
2. 本番へDB変更が必要なら、[migration手順](../runbooks/migration-deploy-order.md)で先に適用・照合する。
3. 依存するEdge Functionを[専用手順](../runbooks/edge-function-deploy.md)で配備・確認する。`_shared`変更は全関数への波及を扱う。
4. mainへのリリース後、migration-gateからVercel本番反映へ進む。developへのマージは本番公開ではない。

元運用の[vercel.json](../../vercel.json)はGit連携による自動deploymentを無効にし、GitHub Actionsの配備に寄せている。このリポジトリへの配備連携を意味しない。
本番workflowにもDBの`push`やEdge Functionの`deploy`はない。deploy-lagもdeployのneedsには含まれない。
古いrunbookの実行条件と食い違う場合は、workflowとscript本体を確かめる。

## ビルドと入口の防御はそれぞれ役割が違う

| 設定 | 責務 |
|---|---|
| [package.json](../../package.json) | predevでSW生成、prebuildでWasm整合確認＋SW生成。本番はNext webpack build |
| [next.config.ts](../../next.config.ts) | CSP・HTTP防御ヘッダー、公開Storage画像最適化、immutable配信、3Dの遅延chunk分離 |
| 同上の互換plugin | Next 16でなくなったapp-build-manifestを、既存のルートサイズ検査用に出力 |
| [proxy.ts](../../src/proxy.ts) | admin/dashboardの入口で軽いIPバースト制限＋認証更新。公開DB書込み全体の制限ではない |
| [instrumentation.ts](../../src/instrumentation.ts) | Node/EdgeごとのSentry設定とサーバー例外フックを接続 |
| [instrumentation-client.ts](../../src/instrumentation-client.ts) | productionかつDSN設定時にSentry。VERCEL_ENVは環境ラベルに使用 |

CSPはNextの起動用inline scriptとLeafletのinline styleを許可し、判断を既存REQへ記録している。
Wasmは`wasm-unsafe-eval`、地理・天気・認証等は必要な接続先を明示する。変更時は外部連携と一緒に確認する。
Next画像最適化のremotePatternsは公開Storageに限定される。非公開の署名画像を公開画像キャッシュへ通さない。
Sentryは自動収集停止と[sentryScrub](../../src/lib/sentryScrub.ts)を使う。source map送信には別のSENTRYビルド設定が要る。
共有のpreview判定はVERCEL_ENV・ZARIDASU_DEPLOYMENT_ENVと公開側ラベルを確認し、previewではDSN/GTM設定時も送信しない。

## バックアップは暗号化済み成果物と復元確認で評価する

元の運用側の `backup.yml` は毎日UTC 18:00と手動実行でDB・Storageを取得する設計。このリポジトリには同梱しない。
age、なければgpgの公開鍵暗号を使い、暗号化ファイルとSHA-256をArtifactsへ14日保存する。
任意のS3互換オフサイト保管経路もある。秘密鍵は運用者側で保持し、CIへ置かない設計。
接続情報が無ければscriptがskipする経路があるため、定期ジョブの成功と実バックアップ取得を分けて確認する。

[backup-db.sh](../../scripts/backup-db.sh)はpg_dumpを優先し、Supabase CLIへフォールバックする。
所有者・権限のdumpを省くため、復元時にはschema/migration由来の権限再構築も要る。
[backup-storage.sh](../../scripts/backup-storage.sh)は既定で`post-photos post-audio rare-photos water-report-photos`の4つをS3経由で取得する。
非公開の後ろ2つ（希少種の写真・水域情報の写真）は2026-10-21に足した。復元できる元が他に無い。bucketを足したときは`STORAGE_BUCKETS`の既定も足す。
平文のtarは作業フォルダに作り、暗号化の途中で失敗しても終了時のtrapで消える（`umask 077`）。

[restore-db.sh](../../scripts/restore-db.sh)と[restore-storage.sh](../../scripts/restore-storage.sh)はチェックサム・復号後、指定先へ復元する。
`DRY_RUN=1`はDB書込み・Storage投入を止めるが、復号内容やパスはローカル出力に現れ得る。
復号できたことと、Auth・RLS・写真URL・原票と公開投影が復旧したことを分けて確認する。
訓練とRPO/RTOの手順は[backup-restore](../runbooks/backup-restore.md)を正本とする。

## 通知・監視の設定はコード外も照合する

cron、Vaultのwebhook secret、ResendのDNS認証、VAPID、AI停止設定はGitだけでは稼働を確認できない。
実装のつながりは[通知・AI](notifications-ai.md)、設定識別子は[外部サービス](external-services.md)へ進む。
AI異常、鍵ローテーション、料金、メール認証、Web Vitals、障害対応は既存[runbooks](../runbooks/)へ集約する。
全scriptの目的・副作用は[運用スクリプト索引](operations-ci-scripts.md)、検査の限界は[検証](validation.md)を参照する。
