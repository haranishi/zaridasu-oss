# 履歴なし公開候補の検証記録

2026-11-16。新しい [zaridasu-oss](https://github.com/haranishi/zaridasu-oss) はprivate。公開切替は未実施。
元repoの公開、旧キー失効、本番DBやクラウドの変更を行った記録ではない。
最新の確認結果は、2026-11-24の[追加点検](followup-20261123.md)を参照。以下は、記録した時点の状態。

## タスク9.4：ローカル候補の準備

- VERIFIED。別実装者の文書整理を、別レビュアーがAPPROVEDと判定した。
- 元sourceはdevelop `f70579c6cdc3e77d54469cc3d47f214aca83c9fa`。
- 元のexportを変更せず保管。2,629ファイル、16,039,785 bytes。
- 候補は既存14文書と新規案内1文書だけを調整し、アプリ・設定・lock・workflow・素材はexportと同一。
- 原画像8点のhashは候補source内に0件、代替8点は許諾確認済みの参照元とバイト一致。
- 本番/backup workflow・私的ツール・旧fingerprint除外・ビルド生成物は新Gitに含めていない。
- 候補は新規Gitの2commitから開始。元repoのcommit objectは存在せず、旧履歴・PR・ログ・artifactを取り込んでいない。
- source commit：`8326b735a2c440799a4d016cd5a5246f2bb57f9d`。
- source tree：`5b7d7c27c453a83367f17c394afa982e4c2507d8`。
- stage対象は明示した2,630ファイルだけ。sourceと新しい全Git履歴のOSS秘密検査はいずれも検出0件。
- 文書の相対リンク217件は解決。今回の文書差分の空白警告0。継承した元ファイルの書式は保持。
- 日本語lintは変更15文書で新規警告0。既存の文体警告は意味を変えず保持。

## 候補そのものの検証

本番・クラウドの資格情報を渡さず、公開されたCI用擬似値だけを使った。

| 確認 | 結果 |
| --- | --- |
| npm ci | 新しい依存環境に816 packages導入、exit 0 |
| lint・型検査 | 両方exit 0 |
| 単体 | 187 files、2,036 tests成功 |
| 本番build | exit 0、115 pages生成 |
| ローカル起動 | home/mapと代替画像2件がHTTP 200 |
| npm依存監査 | rootとmigrationの両lock、全severityで検出0 |
| 独立レビュー | 文書・ハッシュ・リンク・素材・source/history監査を独立実測 |

レビュアーによる追加exportテストはsandboxの一時ファイル書込制限で開始不可。
代替起動も既存configに非対応のため止めた。親の全単体成功とソース同一性を確認し、追加実行済みとは記録しない。
元repoのDependabotも、今回の読取でopen 0件を確認した。無関係な依存更新PR191は変更していない。
PR1の完了済みCIログ9jobを接続経由でメモリ内点検し、列挙したprovider/Next鍵パターンの検出0件。
CLIからのログ読取は開始不可で、native gitleaksによるログ検査とは区別する。ログ本文・値は保存していない。
ログの数値集計ではブラウザ175件、Cloudflare93件、隔離DB62件の成功も確認した。

## タスク9.5：GitHub側の確認

- [PR1](https://github.com/haranishi/zaridasu-oss/pull/1)は必須8件と性能検査が成功し、developへ統合済み。
- develop commitは`d29a66b0c2b4e01028c2fff282487ecefb14d685`。
- [PR2](https://github.com/haranishi/zaridasu-oss/pull/2)も必須8件が成功し、mainへ統合済み。main向け性能/Dependency Reviewのskipは既定どおり。
- main commitは`dfa3978bf86707e1892b33aa1f14597f50f307e3`。両枝のtreeは検証済みsourceと一致。
- CI runはPR1が43825367470、PR2が43827963913。
- main/developは8件必須CI・strict・管理者適用・PR必須、force push/削除禁止。
- 候補のSecrets・variables・Environment・webhook・deployment・self-hosted runnerは各0。
- Actions tokenは既定read、PR承認権なし。private fork実行は無効で、Secretsとwrite tokenも渡さない。
- 候補のworkflowは検証用ci.ymlのみ。credential参照はbuiltin GITHUB_TOKENだけで、本番配備は含まない。
- VERIFIED。最終CI・両枝のsource照合と独立レビューAPPROVEDを確認し、9.5を完了とした。公開可の判定は含まない。
- 自動作成のDependabot枝6本も取得し、全到達10commitの秘密検査は0件。元repoの履歴は含まれない。
- 各CIのSARIF artifact計2点はメモリ内で開き、results 0件・native秘密検査0件を確認。本文は保存しない。
- 検証CIログ17jobのメモリ内点検も既知パターン0件。追加の自動CI出力はPublic前に再確認する。
- tracked workflowはci.ymlのみ。GitHub管理のDependabot更新workflowも存在し、未採用の更新PRは今回の検証に含めない。
- Actions全体の停止と自動CI一括キャンセルは自動承認レビューが拒否し、未実施。対象5本は全て終了し、承認・キャンセル操作は不要になった。

## 最後に残す判断

Public限定のfork承認・非公開脆弱性報告・Dependency Reviewは[切替手順](public-cutover.md)で確認する。
元repoのSecrets7件の移設は、[運用手順](operations.md)に沿った本人担当の残件。
Google旧キーの失効、本番Webhook認証、AI等の上限設定は、2026-11-24に確認した（[追加点検](followup-20261123.md)）。
Cloudflareの実Freeプラン・provider CPU・remote試験と本番移行は別仕様の残件として保持する。
