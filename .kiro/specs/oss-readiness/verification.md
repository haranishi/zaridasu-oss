# OSS公開準備の検証記録

検証日：2026-11-13。基点：develop `283687c`。本番の書込・配備・公開切替は行っていない。
既存worktreeの未保存のロゴ・画面変更は対象に含めていない。
最新の確認結果（Google旧キーの失効、本番Webhook認証、AIの上限・停止手段）は、2026-11-24の[追加点検](followup-20261123.md)を参照。以下は、記録した時点の状態。

## 実装と機械検証

| 確認 | 結果 |
| --- | --- |
| 空の依存環境でnpm ci | 成功。同梱toolsへの相対参照を修正。既存lockと整合 |
| precheck | 全10ゲート成功。lint・型・翻訳・schema契約・認証経路・非公開表・単体・audit・通常secret scan・Edge |
| Vitest | 183ファイル・1,983件成功 |
| Edge Functions | 269件成功。外部APIは模擬したテスト |
| 本番build | 成功。本番資格情報を渡さず、擬似URL・公開キーを使用 |
| 素のPostgreSQL 16 | CIと同じauth/storageスタブから、ON_ERROR_STOP=1でschema初期化成功 |
| ローカルSupabase | 現行schemaと権限保護を含むsnapshotからfresh reset成功、架空会員と投稿2件のseed成功 |
| 関連DB回帰 | 7ファイル・61件成功。関数閉鎖、非公開プロフィール、時刻固定、列保護、退会、運用列、通知先取り |
| source archive | 展開した2,925項目に私的ディレクトリ・本番/backup workflow・生成物なし。別ディレクトリでnpm ci成功、追加秘密検査0件 |
| 実ブラウザ | 外部通信を遮断し、架空会員の認証200・ログイン画面閉鎖・架空投稿詳細の表示を確認 |

ローカル検証はNode.js 24.22.1/npm 12.2.1、Supabase CLI 2.121.0を使用。
CIのNode.js 22での検証結果は、PRの最新runで別に確認する。

## セキュリティの境界

定義済みPRジョブから本番資格情報の参照を除き、本番jobをmain push専用production.ymlへ分離した。
migration照合は資格情報不足・API失敗・不一致で配備を止め、deployのneedsを維持する。
同一repoへwrite権限を追加する場合、repository Secretsを任意のPR workflowから参照できる点は別に残る。
本番SecretsのEnvironment移管・main限定の設定は、コード変更だけでは完了しない。

ローカルDBと本番DBの両方を読み取り照合し、次の4項目がすべてfalseと確認した。

- anonによる内部の週次通知対象RPCの実行。
- anonによるuser_profiles.unsubscribe_tokenのSELECT。
- anonによるposts.latのSELECT。
- anonによるrare_sightingsのSELECT。

本番ではDB VaultとEdge側のWebhook秘密の存在を確認した。値は取得・出力していない。
強制設定の値、両側の値の一致、AIの上流quota・費用上限は未確認。

## 秘密情報・公開対象

- 現行のGit管理ソースと未ignoreの新規ソース：追加検査で検出0件。
- 全ローカルGit参照：既知のGoogleキーとSupabase PATの2件を検出しexit 1。値は出力しない。
- 通常CIのスキャン成功は、既知漏洩の失効や公開可能性の証拠として扱わない。
- 旧キーの初回確認は未実施だったが、本人許可後の照会ではGoogleが200、Supabase PATが401。Googleの交換・失効は本人担当へ引き継いだ（2026-11-24に失効済み）。
- GitHubはprivate。main/developの保護フラグはfalse、ruleset一覧は空だった。
- Actions artifactは163件あり、バックアップや試験記録を含む。内容の一括監査・削除は未実施。
- private vulnerability reportingの照会は404。有効な非公開窓口を確認できたとは扱わない。
- コードとデータの既存ライセンスは維持。素材台帳の未確認事項は公開の残件。

## 発見して修正した初期構築の問題

過去migrationは空DBで2本目に失敗するため、適用済み履歴を書換えず、独立したlocal snapshotを採用した。
現行schemaにも列・表より先の参照が2か所あり、定義順を修正した。CIのSQLエラー無視も止めた。
実ブラウザではCSPがHTTPのローカルAPIを拒否していたため、開発時だけの明示loopback許可と5件の回帰を追加した。
通知先取りテストは、行が0件という期待から、実装済みのACL拒否42501を要求する検査へ直した。権限は緩めていない。

## 独立レビュー

読み取りレビューでCIのStorage前提とsnapshotの権限確定不足を発見し、修正・実DB検証を行った。
CSP・画像取得・SQLテスト・export-ignoreの最終差分も確認を受け、追加の具体的不具合はなかった。
ソースレビューと実行結果は区別し、PRのCIと公開前の本人確認を残す。

## 提出先

[PR181](https://github.com/haranishi/zaridasu/pull/181)をdevelop向けに作成した。基点は冒頭の283687c。
CIの現在の合否はPRの最新headのChecksで確認し、ローカル結果と混同しない。
本番mainの配備・公開切替・履歴の書換え・鍵の失効は、このPRの作成やdevelopへの統合とは別の操作である。

## CIで追加確認したこと

5721459のrunではNode.js 22のtest job（lint・型・build・coverage）が成功した。
DB2ジョブはubuntu-latestでpostgresql-client-16を取得できず停止したため、Ubuntu 24.04へ固定した。
[公式runner一覧](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)のPostgreSQL 16を前提にする。
Edge依存取得は直前の同一実装runでは成功、5721459では失敗した。最終headの結果で判定する。

4f89b5fのrunではEdgeとschema-driftも成功。DB回帰では一括GRANT後の内部通知台帳のSELECT拒否が未再適用だったため、既存206のSQLを再適用リストへ追加した。
テストの42501要求は維持し、実際の本番と同じ拒否をCIにも確定する。

## 2026-11-14の運用・素材の反映

main/developを管理者込みで保護し、GitHub Actions Appの8検査・最新base・PRを必須化、force pushと削除を禁止した。
Productionの実設定はbranch型mainのみ。GITHUB_TOKENはread・PR承認不可。ダミーSecretの登録・削除・暗号文復旧も成功した。
[PR182](https://github.com/haranishi/zaridasu/pull/182)をmainへ反映（8879605）。必須CIは全成功。本番のmigration-gateとWeb配備も成功した。
mainの情報用jobは、health-geminiに10月の共有コードが未反映（稼働版7月）と検出して失敗した。関数の更新は行っていない。
既存Secrets7件はrepo配置のまま。封印してartifactへ移す案は自動承認レビューに拒否され、workflow作成・実行・値の取得は行われていない。
したがってSecretsの完全な分離と非main枝からの拒否試験は、承認済みの移設経路が整うまで未完了。

公開用exportでは未確認画像8点を除外し、Leafletマーカー/BSD全文とLP図/MITへ代替する。元画像は維持する。
cd3f93eの生成先でnpm ci、183ファイル・1,976単体、本番buildが成功。元のprivate開発ソースは184ファイル・1,987単体と10 precheckが成功した。
main統合後の15件の境界/export回帰も成功。build済み候補と統合後のアプリ本体は同一で、差分は参加・運用文書のみだった。
外部通信を模擬・遮断した実ブラウザで、代替画像の最適化HTTP 200を確認した。
帰属リンクは横方向の検査だけではスマホの固定ナビによる遮蔽を見逃したため、地図の高さを確保し、実際のクリック可否を含む5幅の回帰を追加した。
修正後の公開用コピーで本番build・Playwright 1件（390/768/1023/1024/1280px）が成功。lint・型・境界/exportの15件も再成功した。
ソースと生成先の追加秘密検査は0件。この時点では、公開切替・Googleキーの失効・本番画像の利用権限まで完了とは扱わなかった（Googleキーは2026-11-24に失効済み）。
