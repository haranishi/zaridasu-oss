# 追加課金なし候補の検証（2026-11-16）

[9.7の実行契約](zero-overage-execution-20261116.md)と[タスク7節](implementation-tasks.md)の記録。
合格はローカル候補に限る。実accountのFree適用・provider CPU・本番切替は未検証。

## 7.1：D1 cache

native D1検査12/12、独立review APPROVED、追加probe26件、親の再実行12/12に成功。
primary read、bound SQL、原子的value/timestamp、削除/再起動/namespace、UTF-8上限と障害拒否を確認。
証拠はprivate `.wrangler/task-7.1/`。commitは`e5c9ffaaee3bdd1fb67e3a34c437d7b9bce2b421`。
quotaはnative周辺への注入であり、providerの実上限到達を証明する試験ではない。

## 7.2：R2なしの実アプリ候補

入口Worker、private rendererのSQLite DO、D1 cache、SQLite DO queue、Images変換を使用する。
本物のwaitUntilを接続し、既存の認証・役割/IP・Cookie・private/no-store/noindexを維持した。
不変のlicensed sourceは2,605files/15,894,344B、revision e5c9ff。元8画像をlicense付き代替へ置換。
新しい空buildへ明示overlayを加え、clean npmci816、実Next/OpenNext buildと3 Worker dry-runを実行。
初回の配備除外buildは再利用せず、Next鍵4種の存在・相違をRAM内で比較しbooleanだけ記録した。
最終overlayは23件。framework依存を変えないwrapper等5件の修正後、3 dry-runを更新した。

| 検証 | 結果 |
| --- | --- |
| pure | 13/13、失敗skip0 |
| native workerd/browser | 6/6、失敗skip0、独立再実行も成功 |
| 既存default互換性 | 親の14files/64tests成功、生成物3,370件のhash不変 |
| static | root/Cloudflare型、scoped ESLint、差分検査に成功 |
| 公開側監査 | source/assets秘密検出0、元画像混入0、map0、private鍵完全byte出現0 |
| private側監査 | 97件をNext生成鍵38件とコード59件へ分類、未分類0。実鍵値4種は非公開 |
| 独立review | 最初のCriticalを修正し、fresh reviewでAPPROVED |

最初のreviewでは、同時8要求のうち7件が読取障害をHTTP200へ変えることを実測した。
Nextが共有する描画の所有者について、後続continuationを含む完了と失敗を待ち手へ伝えるよう修正。
有限のpeer snapshotは将来の無関係なtrafficを待ち続けない。正しいframework tokenのISRを別scopeにする。
read/write障害それぞれ8並列すべて503、全body消費後の後続要求も503、解除後は同一workerdで200へ回復。
独立した70ms遅延・0〜90ms時差8要求と偽装ISRでも503。native method改変・runtime外部通信0。
SSR Cookie差分/削除/再利用、actor切替と分離、転送/複数Cookie/IP、ISR更新/削除と永続化を確認。
32px画像変換と1200pxの日本語/emoji OG、実ブラウザーのA→B分割Cookie→A→anonymousも成功。

証拠はprivate `.wrangler/task-7.2/parallel-remediation/`と`parallel-review/`。
最終manifestは`overlay-manifest-final.json`、検証概要は`validation-summary-final.json`。
監査では既知生成鍵の集合を変更せず、literal/comment/regex/templateや曖昧な位置・非JSの一致を許可しない。
compiledの検出を一括で誤検知扱いせず、今回の値と構文に基づいて分類した。

## 7.3：read-only preflight

Free不明/Paid/証拠不整合/別account/権限・資源名・予算・binding不備、localダミーIDを拒否する。
隔離済みpath・symlink alias、source/config/output改変、公開権限の広い証拠や未分類private materialも拒否。
認証出力はRAM内だけで扱い、Wranglerのdisk logとmetricsを明示的に止め、固定GETのmetadataだけを保存する。
新規29件＋既存13件の関連42件、独立再実行54件、親のdefault15files/93件に成功。失敗skip0。
親は3,370件のdefault生成物hash不変、review済みruntimeの不変、sourceの前後一致も確認した。
実accountは一致/accepted管理者、Worker9件・既存D1 1件、資源名衝突0。契約API403/10000で全5製品UNKNOWN。
実候補はinventory3,381件とbackend assets10件の合計3,391件を照合し、UNKNOWNとLOCAL_ONLYでDENY（exit1）。
backend素材は厳密な集合とsource/target双方をbaselineへ固定し、改変/追加/欠落/directory/symlinkを拒否する。
9件はscripts/cloudflare/assets、markerはpublic/images/leaflet/marker-icon-2x.pngを出所とし、導出証拠をdigestへ含めた。
初回reviewのasset検証漏れを修正し、RED19件中18fail→GREENを保存。fresh reviewはAPPROVED。
Wranglerが更新した説明ファイルの日時1件は親が固定templateと照合し、旧inventoryを保持して明示再承認した。
証拠はprivate `.wrangler/task-7.3/`、修正記録は`backend-assets-remediation/`。

## 残る条件

7.3の実装承認は、実際のFree適用確認や配備の承認を意味しない。
現状のsubscription APIは403/10000。standard usage_modelやentitlements0件はFreeの証拠にしない。
DO FreeのCPU条件は未確定。local startupやnative成功をprovider CPUの証明へ代用しない。
7.4で既存必須CIとPR、7.5はFree証拠が揃った場合だけ新非本番資源250要求/100MB以下で実測する。
Cloudflare新規資源・課金変更・本番変更は0。R2有効化、有料化、DNS、実データ/Auth/media移送は行っていない。
