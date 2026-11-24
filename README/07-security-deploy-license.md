# 権限・配備・ライセンス

[READMEへ戻る](../README.md) · [参加ガイド](../CONTRIBUTING.md)

## 公開・本人・運営の境界

公開情報、本人用の場所や調査、運営だけが扱う情報を分けます。
画面の表示だけで権限を成立させず、DBのRLS（行の権限）・列の権限・RPCでも確認します。

| 領域 | 守ること |
|---|---|
| 投稿 | 本人の作成・編集と、管理者やAIの審査を分ける |
| 位置 | 公開用の座標と、本人・管理者の正確な座標を分ける |
| 非公開調査 | 本人の計画・地点・希少種と、公開投稿を別に扱う |
| 管理操作 | 管理者をサーバーとDBでも確認し、監査を残す |
| 通知・外部連携 | 呼出元と設定を確認し、秘密をブラウザへ渡さない |

詳しい条件は [privacy](../docs/current/privacy.md) と [認可の設計](../docs/architecture/authorization.md) を参照してください。
変更時の検査は [検証ガイド](../docs/architecture/validation.md) を使い、秘密値を文書・PRへ貼り付けません。

## PRとソースのリリース

```mermaid
flowchart LR
  Work[作業ブランチ] --> PR[develop向けPRで検査]
  PR --> Develop[developへ統合]
  Develop --> Release[mainでソースをリリース]
```

このリポジトリのmainはソースのリリース用、developは統合先です。自動配備はなく、参加者のPRから本番へ配備できません。
PRと必須CIで保護しています。設定と実行結果の確認は [公開の状況](../docs/oss/release-status.md) に記録します。
以下のDB・Edge・復旧手順は元の運用側の設計記録です。このリポジトリへ本番のキーや配備連携を引き継ぐ手順ではありません。

- DB：[適用と配備の順序](../docs/runbooks/migration-deploy-order.md)
- Edge：[関数の配備](../docs/runbooks/edge-function-deploy.md)
- 復旧：[バックアップ・復元](../docs/runbooks/backup-restore.md)
- 実行条件：[CIと運用](../docs/architecture/operations-ci.md)、[workflow本体](../.github/workflows/ci.yml)

## コード・データ・素材の条件

| 対象 | 確認するもの |
|---|---|
| ソースコード | [MIT LICENSE](../LICENSE) |
| 公開データセット | このリポジトリとは別にCC BY 4.0で提供する。[公開・引用の手順](../docs/runbooks/open-data-doi.md) |
| 同梱素材・テンプレート | [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md) |
| 依存パッケージ | 各パッケージのライセンス |
| 引用 | [CITATION.cff](../CITATION.cff) と、対象データのDOI |

GitHubの公開範囲と、コード・データ・素材それぞれの条件を確認して扱います。
