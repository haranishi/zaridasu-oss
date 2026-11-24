# 公開直前に確認すること

公開操作は、対象と検証結果がそろってから保守者が判断します。
コードが動くこと、秘密がないこと、データ・素材を公開できることは別の確認です。
このリポジトリ `haranishi/zaridasu-oss` は、元の運用repoから履歴なしで切り出したものです。[由来と未確認事項](release-status.md)を入口にし、元の運用repoは非公開で保持します。

## 1. 秘密と履歴

```sh
npm run oss:audit
npm run oss:audit:history
```

gitleaks v8が必要です。Git管理対象と未ignoreの新規ソース、および手元にある全Git参照の履歴を別々に検査します。
現在の検査は、ignore済みのローカル資格情報・runtimeデータをコピーせずに行います。
通常CIの既知漏洩除外を使わず、Googleキー・Supabase PATの形式も追加確認します。
結果にはルール名・パス・行・コミットだけを出し、検出値やツールの生ログを表示しません。
履歴に既知の値がある間、履歴検査は失敗するのが正しい結果です。
この検査だけで、未取得のremote ref、PR/Issue、Actionsログや画像に秘密がないとは証明できません。
元repoを公開する場合は、fetch済みの枝・tag・PR参照と公開対象のログ・artifactも照合が必要です。今回の公開用には、それらを取得・移植していません。

漏洩キーの失効・交換は [既存runbook](../runbooks/secret-rotation-and-history-purge.md) に従います。
履歴の削除を失効確認の代わりにしません。本番のキーを取り替えた場合は主要機能の継続動作も確認します。
元の運用repoのSecrets移設は、運用者が別に行います。SecretsをActionsのログ・artifactへ出して回収したり、このリポジトリへコピーしたりしません。

## 2. 公開範囲と権利

- 実データ・管理キー・私的な設定・SQLダンプ・バックアップを公開対象に含めない。
- [素材台帳](../../THIRD_PARTY_NOTICES.md)の未確認素材は、出所と再配布条件を確定するか、許諾済み素材へ差し替える。
- 大学・共同研究・外部協力者との取り決めがあれば、コード公開の条件と著作者の権利を確認する。
- コードのMITと公開データのCC BY 4.0を維持する。別の条件へ変える場合は別に判断する。

## 3. 履歴なしの公開用ソースを作る場合

このリポジトリのexport元revisionと素材manifestは [公開の状況](release-status.md) に記録しています。
次は元repo側でsourceを切り出す手順です。変更をcommitしてから、新しいsourceディレクトリを作ります。

```sh
npm run oss:export -- /path/to/new-directory
```

`.gitattributes`により、私的な作業ツール、本番配備・バックアップworkflow、既知漏洩の除外表を含めません。
さらに未確認の8画像を除き、許諾を確認できる素材のコピーを配置します。代替一覧と条件は生成先の`public/OSS_ASSET_MANIFEST.json`に入ります。
元画像は変更しません。単純な`git archive`だけでは画像が欠けるため、公開用にはこのコマンドの結果を使います。
存在する出力先や未commitの変更を拒否し、作成前後の秘密情報検査に失敗した場合は生成しません。
生成先にGit履歴は入りません。ただし、これだけで現在のコードや素材が公開可能になるわけではありません。
展開後の一覧と秘密情報スキャンを確認し、`npm ci`から検証を再現します。
元repoの公開設定は変更せず、バックアップや既存PRを保持できます。
公開先を作成する際はこの確認済みの内容だけを取り込み、元repoをforkしたり履歴をmergeしたりしません。

## 4. 公開先と本番を守る

このリポジトリのPR検査は `ci.yml` が担当します。`production.yml` と `backup.yml` は元の運用側だけに残し、ここには配布しません。
このリポジトリのmainはソースのリリース用、developは統合先です。main/developへのpush・mergeに自動配備はなく、参加者のPRから本番へ配備できません。
ここには本番Secrets・Environment・配備連携を引き継ぎません。Secrets・Environment・hook・配備の実設定を別に照合します。
main/developのPR必須、strictな必須CI8件、管理者への適用、force push・削除禁止を確認し、CIの成功も実行結果で確認します。
本番のRLS/列権限、非公開Storage、Webhook認証、AI停止手段、予算・quotaは元の運用側で別に照合します。

公開の切替後は、GitHubのfork実行承認を `all_external_contributors` に設定し、外部参加者のCI実行を保守者が確認します。
private vulnerability reportingも同じ手順で有効にし、[SECURITY.md](../../SECURITY.md)の入口から非公開で報告できることを確認します。
これらは公開後にだけ確認できる項目です。確認が済むまで、公開の告知はしません。
