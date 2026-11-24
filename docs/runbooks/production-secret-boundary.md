# 本番Secretsと開発の分離

mainは本番、developは開発の統合先。外部の参加者はforkからPRを送る。
main/developへの直接push・force push・削除を制限し、PRの必須CIで検証する。
単独運用のため他人のレビュー承認数を必須にせず、保守者が差分を確認して統合する。

## 実行の境界

本番照合・配備・backupはProduction Environmentを参照し、mainだけで実行する。
Environment側もbranch型mainだけを許可する。tag型mainやprotected全枝には広げない。
PRの品質検査は架空値とローカルDBで動かし、本番Environmentを要求しない。
外部参加者へ元repoのwrite権限や本番の資格情報は渡さない。

## Secretsの配置を切り替える

Productionには次の同名Secretsを用意する。値はチャット・ファイル・ログへ書かない。

- SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF / SUPABASE_DB_URL
- VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID
- BACKUP_AGE_RECIPIENTS

GitHubのSettings → Environments → Production → Environment secretsで登録できる。
CLIを使う場合も値は引数へ書かず、対話入力または標準入力を使う。

```sh
gh secret set SUPABASE_ACCESS_TOKEN --env Production --repo haranishi/zaridasu
```

保存済みのrepo SecretsはAPIで読み戻せない。値を変えず移す方式には別の明示承認が必要。
同名ならEnvironment値が優先され、未登録の間はrepo側の同名値が使われる。
そのためworkflowにEnvironmentを付けただけでは、他の枝からのrepo Secrets利用は防げない。

1. Productionに必要な値を登録する。元のrepo Secretsは残す。
2. mainの照合・配備と暗号化backupが動くことを確認する。
3. 復旧手段を確保し、保守者の承認済みの方法でrepo側の同名Secretsを削除する。
4. 非main枝のProduction利用が実行前に拒否され、repo側にも値が無いことを照合する。

Secretsの移設・元配置の除去が終わるまでは分離完了と扱わない。
repoの公開切替と、公開後のfork実行の承認設定は別の公開手順で確認する。
