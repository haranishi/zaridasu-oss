# Cloudflare候補は合成検査を通し、配備先確定後に隔離する

更新：2026-11-15。移行を担当する開発者向け。Node 22.23.4とrootのlock依存、Chromiumが前提。
初回は実行境界とCIを読み、再実行時はコマンド、配備時は後半の未確認条件を参照する。
対象は[実行契約9.2〜9.6](../../.kiro/specs/cloudflare-migration/execution-20261114.md)。本番切替は未実施。

## PRでは既存の必須検査を使う

このリポジトリの[ci.yml](../../.github/workflows/ci.yml)へ追加し、必須チェック名は変えない。

| ジョブ | 追加した失敗判定 |
| --- | --- |
| test | scripts/migrationの独立lockをignore-scriptsで導入し、env -iでnative Turso/local D1を検査 |
| e2e | 既存E2E後にpreview fixture build/dry-run、cf-typegen、root/CF型、実workerd/browserを検査 |
| audit | DB試作の独立lock全体をpackage-lock-onlyで監査し、low以上で停止 |

e2eは既存のChromium導入/cacheを再利用し、test/e2eの30分枠を維持する。
新しいCI tierやCloudflare token・Production Environmentは要求しない。初回PRのUbuntu実行結果と所要時間は別途確認する。
元repo側の `production.yml` はmain push→migration-gate→固定Vercel配備の設計記録で、この公開リポジトリには同梱しない。
このrepoのmain/developに自動配備はない。元のmain `3e46e0b` のci.yml内の本番処理という記述も、2026-11-15時点の履歴として扱う。

## 本番鍵のないcheckoutで最新Workerを作る

本番の環境変数を渡さずrootで実行する。`.env`・`.dev.vars`があるcheckoutはbuilderが拒否するため、隔離worktreeを使う。
cacheを変更する場合だけnpmへ任意の`--cache <path>`を追加する。

```sh
npm ci
npm run precheck:full
npm run build:cloudflare:fixture
npm run cf-typegen
npm run type-check:cloudflare
npm run type-check
npm run test:cloudflare
```

fixture builderは実OpenNext buildとWrangler dry-runを順に行い、配備やsource-map uploadを行わない。
`ZARIDASU_DEPLOYMENT_ENV`と`NEXT_PUBLIC_DEPLOYMENT_ENV`をpreviewへ固定し、ASSETS/SSR/APIをnoindexにする。
非空の合成Sentry DSN/GTM IDでも実ブラウザーの送信試行0、実SDKの収集抑止/static scrubを検査する。
本番鍵・実投稿・非公開位置・利用者メールは使わない。Node buildのfont取得と依存導入/監査は通信を使う。
workerdとブラウザーのfixture実行は合成allowlist外を拒否し、ネットワークfallbackを持たない。
noindexは閲覧認証ではない。実データを含む成果物をpreviewへ置かない。

DB試作は[独立環境の手順](../../scripts/migration/README.md)で同じlockから実行する。
CIと同じ`env -i`はPATH/HOME/TMPDIR/LANG/CIだけを渡し、接続URLやtokenを継承しない。
DB状態とprivate証拠は`scripts/migration/.runtime/`、Web証拠は`.wrangler/`でGit対象外。
lintは生成されたDB状態だけを除外し、実装MJSを検査する。秘密走査はGit source全体に維持する。

## local合格とremote配備を分ける

現在のWeb26件・DB62件は実local engineの代表契約。最新の結果は[検証記録](../../.kiro/specs/cloudflare-migration/implementation-verification.md)へ残す。
画像の実resize、日本語/emoji PNG、native R2/DO/self-binding ISR、Wasm ABI/CSP、訪問済みDrawerの圏外保持を確認する。
未訪問Drawer chunkは既存のerror回復でSW解除/cache清掃を起こす。完全な圏外操作・下書き維持の合格にはしない。
Header/error/SWのmain/develop sourceは同じだが、旧Vercel配備とのruntime比較は未実施。
合成AES-GCM復元や認可/再送の成功だけでDB/Auth/メディアの移行・Turso/D1の採用を決めない。

## remoteはアカウントと代替画像を揃えてから進める

使うアカウントは運用者が1つに決め、6.12はそのアカウントへ固定し、他のアカウントへ自動で切り替えない。
R2を使う版は、local回帰検査と履歴のために残している（R2の有効化依頼は撤回済み）。現行の候補は [R2なしの手順](../../scripts/cloudflare/free-README.md) を使う。
課金プランと権限の確認が終わるまで、remote資源の作成と配備は保留する。必要な課金変更は、運用者が判断する。
6.11の権利未確認8画像を除いたexportが前提で、localのlicensed fixtureを元画像の権利証拠にしない。
アカウント確定後、担当者が次の証拠を揃えてから隔離previewの可否を判断する。

| 対象 | remoteで確認する条件 |
| --- | --- |
| 契約・費用 | plan/権限、IMAGES/R2/DOの利用可否、CPU/読書き/容量、予算・停止条件。必要な課金変更は本人判断 |
| 配信・認証 | 専用名とbinding、共有cacheへのprivate混入0、Cookie/role/信頼IP、noindex/外部送信停止、アクセス制限 |
| 容量・起動 | 実upload対象のraw量、remote startup_time_ms、static asset数/サイズ。local profileはremote判定の代用にしない |
| 画像 | Worker内のorigin/redirect拒否に加え、custom zoneのTransformations Sourcesを別途制限して実URLで検証 |

2026-11-15確認の[公式Workers制限](https://developers.cloudflare.com/workers/platform/limits/)は非圧縮64MiB。gzip値は参考で、remote起動条件は別に照合する。
[zone画像source設定](https://developers.cloudflare.com/images/optimization/transformations/sources/)は`/cdn-cgi/image/`用で、Worker fetchの検証とは独立する。
local Workerの404だけでzone edgeの制限済みとは判断しない。
Google/provider設定と旧本番の確認は、運用者の担当として残す。秘密値の抽出artifact方式は使わない。
DNS・課金・本番鍵/書込先・既存資産はこの手順で変更しない。Supabase/Vercelを本番の正本として維持する。

本番切替と書込み開始前後の復旧は[切替/切り戻し](../../.kiro/specs/cloudflare-migration/cutover-and-rollback.md)に従う。
未確認事項や採用判断は[現在のタスク](../../.kiro/specs/cloudflare-migration/implementation-tasks.md)へ戻す。

隔離previewのprofile生成・専用verify・正しいmultipart起動計測は[ローカル準備手順](../../scripts/cloudflare/preview-README.md)に従う。localの成功はremoteの配備合格と分ける。
