# 本番・開発の権限分離の反映

2026-11-16更新。本人がmain/develop分離と外部参加の設定を依頼。Googleキーは本人担当だった（2026-11-24に失効済み。[追加点検](followup-20261123.md)）。
元のprivate repoの運用手順。履歴なしのOSS候補には本番Secretsを登録しない。
公開切替、本番DB変更、鍵の失効、外部利用者の招待は含めない。

## 反映済みの境界

- main/develop：PR必須、最新baseとのCI必須、force push・削除禁止、管理者にも適用。
- 必須CIはtest/e2e/rls-tests/edge-functions/schema-drift/rust-geometry/audit/gitleaksの8件。
- 一人運用のため、他人の承認数・CODEOWNERS承認・最後のpushの別人承認は必須にしない。
- Production Environmentはbranch型mainのみ許可。tag型mainやdevelopを許可しない。
- 本番の照合・配備・backupはProductionを参照し、PRの品質検査にはEnvironmentを付けない。
- GITHUB_TOKENは既定read、PR承認権なし。private forkへSecrets/書込tokenを送らない。

## 元の本番Secretsを移す手順

元repoはrepository Secretsが7件、Production Secretsが0件のまま。
GitHubのAPIでは既存の値を取得できない。値をActions・artifact・ログ経由で取り出さない。
同じ値の保存元を保守者が確認して、次の順で直接登録する。

1. 元repoのSettings → Secrets and variables → Actionsで対象7件の名前だけを確認する。
2. Settings → Environments → Production → Environment secretsへ、保存元から同名・同値を登録する。
   [Production設定](https://github.com/haranishi/zaridasu/settings/environments)で行い、チャットやIssueへ値を貼らない。
3. 保存元が分からない項目は登録済みと扱わず、旧repository Secretを残す。必要な再発行は保守者が判断する。
4. Productionの名前7件とbranch型mainの制限を、APIのメタデータで照合する。値は取得・記録しない。
5. 信頼済みmainの本番照合・配備・backupで、新配置を参照した実行成功を確認する。
   新配置は同名repository Secretより優先される。単なる件数一致だけで成功としない。
6. 成功した対象だけ、元repository Secretを除去する。新配置での復旧手順も先に確認する。
7. 非mainからProductionを要求する試験が実行前に拒否されることと、元配置の除去を照合する。

手順2は本人による保存元の確認と直接登録が必要。それ以後の照合は値を見ずに再開できる。
新しい公開候補repoへの登録、追加の管理PATのrunner投入、秘密を取り出す一時workflowは使わない。

## 検証と失敗時

- 既存mainのworkflowとProduction制限を保持する。アプリ本体やDBを同時変更しない。
- 登録前は旧Secretsを残し、動いている配備とbackupを維持する。
- 新配置の確認に失敗したら元配置を除去しない。今回登録したProduction Secretだけを削除すれば、残したrepositoryの値へ戻せる。
- 元配置を除く前に、保守者が同値の保存元から再登録できることも確認する。
- 対象の名前・更新時刻・workflow SHA・成功/拒否runを記録し、平文や復旧用暗号文を保存しない。
- 公開候補の検証と元の運用移設は分けて記録し、どちらかの成功でもう一方を完了扱いにしない。

## 保留した旧方式

ダミーSecretの登録・削除・暗号文復旧の試験は成功した。
本番Secretsをsealed boxで暗号化してartifactへ出す一時workflowは、自動承認レビューが拒否した。
そのworkflowの作成・実行・Secret読出しは行っていない。旧方式は再試行せず、上記の直接登録を使う。
