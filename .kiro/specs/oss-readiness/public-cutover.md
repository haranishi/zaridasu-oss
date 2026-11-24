# 公開切替で実施する確認

公開の方法は2案ある。案Bで進める。実行は、公開の最終判断の後。

- 案A：検証用の [haranishi/zaridasu-oss](https://github.com/haranishi/zaridasu-oss) をPublicへ切り替える。履歴の作者メール、PR・Actionsログ・自動更新の枝も公開対象になるため、切替時点まで点検が要る。
- 案B（おすすめ）：検証用はprivateのまま残し、公開の直前に、履歴1コミットの新しいrepoを作る。強制pushも保護の一時解除も要らない。[手順](public-cutover-fresh-repo.md)。

元の本番repoは、どちらの案でもprivateのまま保持する。Public切替と告知は未実施。準備済みの対象commit・検証結果を示して、保守者の最終判断後に進める。

## 切替前

1. 候補のmainに、PRで検証したsourceが統合されていることを確認する。
2. current sourceと全Git参照のOSS秘密検査が0件、代替素材manifest・除外・変更一覧が一致していることを確認する。
   新repoのPR・Actionsログ・artifactも切替時点まで点検する。検証後に増えたDependabot実行も含める。
3. main/developの8件必須CI・strict・管理者適用・PR必須・force push/削除禁止を再照合する。
4. Secrets・Environment・webhook・deploymentが0件で、workflowは検証用CIのみであることを確認する。
5. 公開するのはsourceと再配布できる素材。元repoの履歴・本番データ・資格情報は対象外。
6. Google旧キーの失効、本番Webhook認証、AI等の上限・停止設定は、2026-11-24に確認済み（[記録](followup-20261123.md)）。切替の直前に、状態をもう一度照合する。
7. 全Git参照のコミットで、作者・記録者が匿名のGitHub用アドレス（GitHubの記録用アドレスを含む）だけであることを確認する。
8. 公開する内部記録（本仕様の検証記録）が、6の確認結果と矛盾しないことを確認する。

## Publicへの切替後

保守者の公開判断を得てvisibilityをpublicへ変更した直後、告知の前に実施する。

- fork PRの承認方針を `all_external_contributors` に設定し、GETで同じ値を確認する。
  REST: `PUT repos/haranishi/zaridasu-oss/actions/permissions/fork-pr-contributor-approval`
  body: `{"approval_policy":"all_external_contributors"}`
- 非公開の脆弱性報告を有効化し、GETでenabledと報告フォームの入口を確認する。
  REST: `PUT repos/haranishi/zaridasu-oss/private-vulnerability-reporting`
  報告先: https://github.com/haranishi/zaridasu-oss/security/advisories/new
- Dependency graph・Dependabot alerts・無償で利用できるsecret scanning/push protectionの状態を照合する。
  有料機能や契約変更を有効化しない。未設定・利用不可は成功とせず残件にする。
- 公開後の小さな状態文書PRで、publicでのみ実行されるDependency Reviewも確認する。
  既存8件を含む検査、fork承認、非公開報告先がそろうまでは公開完了と告知しない。
- GitHub Actions tokenは既定read、PR承認権なしを維持する。本番Secretsを登録しない。

## 残る運用作業との関係

元repoのSecrets移設は、元の本番運用の残件として追跡する。Google旧キーは、2026-11-24に失効した。
候補には対象の値・履歴を持ち出さず、残件を解決済みと記録しない。
CloudflareのFreeプラン確認・remote試験・本番移行も別作業であり、OSSのsource公開で移行済みにはならない。

## 参照

- [fork承認API](https://docs.github.com/en/rest/actions/permissions#set-fork-pr-contributor-approval-permissions-for-a-repository)
- [非公開の脆弱性報告](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
