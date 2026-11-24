# 実装段階の検証記録

対象：[実行契約](execution-20261114.md)・[現在のタスク](implementation-tasks.md)。本番切替や全廃の合格とは区別する。

| タスク | 結果 | 証拠・範囲 |
| --- | --- | --- |
| 6.1 | 合格 | source/live台帳と読取aggregate照合、独立review APPROVED。実レコード・秘密値の取得なし |
| 6.2 | 合格 | Node22.23.4、clean npm ci、186files/2,000tests、型/lint/依存audit0、CF build/dry-run/typegen/既存webpack容量予算 |
| 6.3 | 合格 | real workerd 7/7、root/API/assets・Supabase SSRの拒否/許可・合成profile、全Workerのegress拒否・reset/close・秘密ファイル読取0 |
| 6.4 | 合格 | safe fixture build/dry-run/型生成、real workerd13/13、186files/2,022tests、型/lint/秘密検査・独立review APPROVED |
| 6.5 | 合格 | workerd/browser18/18、187files/2,040tests、root/CF型・lint・型生成・CF build/dry-run・容量・OSS audit0、独立review APPROVED |
| 6.6 | 合格（限定） | 実workerd/browser26/26・skip0、独立再実行/review APPROVED、画像取得前拒否・実変換、日本語/emoji PNG、native R2/DO ISRと再起動、実Wasm、訪問済みshellの安定配信 |
| 6.7 | 合格 | 現行Turso0.8.3/native・D1/Miniflare5の同一fixture12/12、clean install・独立再実行/review APPROVED、bind/実制約/snapshot/永続化/reset/所有dir清掃、audit・lint・秘密検査0 |
| 6.8 | 合格（限定） | 実DB36/36、独立再実行・失効race10/10、review APPROVED。主体/列制限、審査4表+claim全取消・版競合、別native接続/D1 batchの競合、依存/秘密/lint0 |
| 6.9 | 合格（限定） | 実DB62/62・独立再実行/review APPROVED、保存+rolling quota/再送、退会DB全取消/外部部分失敗再開、合成AES-GCM復元・非空運用状態/権限、依存/秘密/lint0 |
| 6.10 | local/PR合格 | CI構造/必須8名維持、独立review APPROVED、coverage2047・DB62・fresh CF26、既存E2E174成功+1既存retry成功/失敗skip0、[PR190](https://github.com/haranishi/zaridasu/pull/190)。初回code head a543adcのUbuntu必須8名+perfも成功 |
| 6.11 | 公開候補local合格 | source 9e40517・8代替/全文license一致・元画像混入0、clean npm ci/依存audit0・実build/dry-run/型・CF26/skip0、source/assets秘密検出0、独立review APPROVED |

6.2の独立reviewでNext用fileリンク不整合と新consumer経由のbraces再導入を検出し、既存検査を維持して修正した。
consumer別adapterと実利用試験によりclean install後の参照を確認し、再reviewでAPPROVED。
Workerはraw23,797,895B・gzip5,247,953B。2026-11-14の[公式制限](https://developers.cloudflare.com/workers/platform/limits/)はraw64MiBで、gzipの制限ではない。
実workerdの基本認証/egress/状態分離は6.3、信頼IP・認証障害/偽装拒否・Cookie更新/清掃/再利用・private no-storeは6.4で確認。画像/ISRとlocal startupは6.6で確認。
privateな詳細ログは作業treeの `.wrangler/task-6.2/`。取得した実環境metadataはrepoへ含めない。

## 現時点の未完了

現在は超過課金禁止によりR2有効化依頼を撤回し、[R2なし候補の7節](zero-overage-verification-20261116.md)へ継続する。対象アカウントのFree適用は未確認、remote配備は保留。本番Vercel/Supabase、DNS、実データの書込先は維持する。
DB候補は合成local検査、公開sourceは隔離build検証まで完了。Auth/メディア/全契約の移植は未完了。未訪問の遅延画面を圏外で開く制限は本番切替前の残件。

6.3の初回reviewでWranglerのuserConfigPath経由のroot .dev.vars読取を合成probeで検出し、両設定pathを隔離先へ揃えた。実キーは取得していない。
safe fixture builderは6.4で実行し、更新したWorkerのbuild/dry-runと13件の実行試験に合格した。

6.4で旧Workerの長期cache応答、spoof IP回避、redirect時Cookie欠落をREDとして確認し修正。
実SDKは変更のないCookie chunkを省くため、jarを更新・削除してsession再利用を確認した。三つの変更chunkは3180/3180/1538B。
NextResponse.nextのCookie VaryがframeworkのRSC Varyを上書きするため、passthroughはprivate no-storeを付けて既存Varyを維持する。

6.5は合成DSN/GTMを入れた実ブラウザで送信試行0とhydration/menu操作、全配信面noindex・CSP・Wasm/画像/SW/static headersを確認。
SDK11.11のstream既定はbeforeSendTransactionを無視し、合成PIIが自動spanへ残るREDを再現。4初期化にstaticを明示して実SDK sinkのevent/transaction/自動span除去を確認した。
asset headersの同一path重複による保護header上書きは生成側で修正。最終Next build後はasset生成/dry-run/runtimeだけを再実行した。
同SDKのREQ-211修正は[PR188](https://github.com/haranishi/zaridasu/pull/188)・[PR189](https://github.com/haranishi/zaridasu/pull/189)でmain/developへ分離反映し、本番deploy成功とHTTP200を確認。実ユーザー情報の漏洩は確認していない。


6.6の最新証拠は `.wrangler/task-6.6/` と `task-6.6-retry-suite.log`。日本語OGと安定後の実Drawerを目視確認した。
4 modulesはraw24,425,724B、Node22 gzipSync既定の再集計5,385,616B。local startup profileは143.9ms window/19.5ms activeで、remoteのplan・起動条件とは区別する。
初回の一時的な26/26は後続の安定性検査で撤回。独立debugで未訪問Drawer chunk欠落→既存のSW解除/cache全消去/reloadを特定した。
オンラインで実際に開いたHomeProfile/Drawerの全4依存がHTTP200・CacheStorageへ入り、圏外で実内容・root/dashboard・SW/cacheを読込後1500ms保持する現試験は26/26・skip0。
Header/error/SWのmain/developとのsource同一性は確認したが、旧Vercel配備の比較・未訪問操作・下書き全経路は未検証。cold制限を解決したという合格にはしない。
custom-zoneの画像source設定、remote起動/planと本番切替は別ゲート。licensed fixtureはサイズ/ハッシュ照合済みで、既存8画像の権利確認とは別物。

develop `36b80da` のREQ-211修正を統合し、4初期化で共有static定数とpreview停止条件を維持。統合後188files/2,047unit、36件のSDK/設定試験、root/CF型・lintが成功。
統合後のcompiled Workerは6.10で再buildし、Next/OpenNextのBUILD_ID・98 chunksと照合した。6.6素材の3つのlicenseは元の改行/末尾空白を含む原文を保持し、hashを照合した。

6.7はNode22.23.4/darwin-arm64、ABI127/N-API10で現行Tursoとlocal D1を実行。公開精度3種・UUID/UID・UTC/観察日・NULL/JSON・hash/FKを照合した。
Node guard下の合成値だけの試験で既存credential読取/外部通信0（guard自己検査を除く）。OS全体の通信証明、remote性能/SDK・認可・競合・再送・復元の合格とは区別する。

6.8の証拠は`scripts/migration/.runtime/task6.8-evidence/`。本人にも配信停止tokenを返さず、公開投影だけを明示列で取得する。
最終outboxの実UNIQUE違反で全取消を確認。Tursoは別native接続、D1は同一bindingへの並行batchを使用。認可直後の実権限変更でも副作用0。
Turso0.8.3でUPSERT更新条件内のEXISTSが構文エラーとなり、active主体のINSERT SELECTと条件付きUPSERTへ変更して両DBで再検証した。
固定1時間枠の独立quota予約は保存・再送と分離した試験で、現行の直近60分集計との同等性は6.9へ残す。合成認証とlocal成功は本番Auth/remote採用の証明ではない。

6.9証拠は`scripts/migration/.runtime/task69-{red,green}.log`。同owner/client IDは上限時にも再送でき、内容変更と別ownerへの付替えを拒否する。
DBだけは実エンジン、media/Authは合成callback。副作用後の応答欠落も再試行で完了し、外部の厳密な一度限りは保証しない。
合成snapshotのUTC時刻はmsZ限定。µs/offsetを安全に拒否し、実PostgreSQL精度維持・Auth/R2・旧snapshot後の削除差分/失効・RPO/RTO等を採用前の条件へ残す。
SIGNED_OUTはplan控え/フォーム下書きを清掃し、明示logoutの破棄選択・退会がqueue/IndexedDB清掃を行う。移行再認証は別に扱い、既存キューの再割当や消失を防ぐ条件を記録した。

6.10の証拠は `.wrangler/task-6.10/` と `date-retry/`。初回precheck:fullは13/14成功・E2E失敗でexit1だった。
未変更fixtureのUTC/ブラウザー暦日差を固定時刻のUTC/JSTで再現し、fixtureだけを修正。修正後6/6、canonical全E2Eは174成功+既存home-hub1件のretry成功、失敗/skip0。
その後のfresh CF build/dry-run・型生成・root/CF型・workerd/browser26/26が成功。最新4 modulesはraw24,425,775B、gzip合計5,385,066B、local startup149.7ms window/21.2ms active。remoteのplan/起動判定とは区別する。
独立reviewはcoverage2047・DB62・CF26・lint/秘密検査を再確認。並列時の既存5秒timeout1件は設定を変えない単独coverageで成功し、両ログを保持した。
PRの最終headの必須CIはPR190のChecksで照合し、localの合格・本番切替・remote配備と分けて判定する。

6.11のprivate証拠は `.wrangler/task-6.11/`。source 9e40517の2,583files/15,785,609Bと別build copyを全件照合し、元8画像のhash/完全byte出現0、8代替と全文licenseの一致を確認した。
clean npm ci・Next/OpenNext build/dry-run・型生成/root/CF型・実workerd/browser26/26に成功。4 upload modulesはraw24,431,184B。source/public assets走査は0件。
追加private server走査はexit1/raw34件を維持。25件はcode/compiler情報、9件はNextが隔離buildで生成する3種類の内部鍵で、未分類0件。誤検知や検出0とは扱わない。
継承envは明示した5名と合成fixtureだけで、鍵env継承なし。3鍵の実byte出現はsource全2,583件・public assets全237件で0、Worker/mapはasset root外。値や生reportは保存していない。
fresh retryと独立reviewで全source/配備出力243件のhash・path・size、元画像/親build保持を再照合。独立export試験4/4・lintとRAM内の全34分類・公開側byte0も成功した。
公開sourceは履歴と生成物を含まず、private server生成物は配布物へ入れない。除外したprivate workflowへの参照4件は既知の文書残件として記録し、全公開リンク有効とは主張しない。


6.12はlocal準備のみ。対象アカウントのaccepted管理者権限・既存Worker8件・候補名衝突0を確認したが、R2有効化とplan確認・remote実測は未完了。
新しいprivate buildへ不変のlicensed source2,583件と明示したoverlay15件をコピーし、clean npm ci/実Next・OpenNext build/2 Worker dry-run・型/lintが成功。
専用verifyは16/16・失敗skip0。実workerdのR2/DO署名付きISR・IMAGES・日本語OG・全asset認証と、実ブラウザーのactor A→B(chunk)→Aを確認した。
server/browserの外部通信は0。source/public秘密走査も0件。private server走査28件は18code/tokenと10内部生成鍵に分類し、4種の鍵のsource/public完全byte出現0を確認した。
同一multipartの4 modulesはraw24,472,477B・gzip合計5,390,511B、local startup185.9ms window/38.9ms active。remoteの起動・plan合格には代用しない。
再現手順は[preview guide](../../../scripts/cloudflare/preview-README.md)、private証拠は`.wrangler/task-6.12/`。remote資源作成・課金変更・本番切替は0件。
REDの非空出力とtool-history参照は報告されたが、元TAPは未保存で、過去の実行順序を独立証明できる記録ではない。既存2047 unit/175 E2Eはこのlocal準備で再実行していない。


7.1はD1 cacheのlocal試作として合格。native schema・primary read・原子的更新・削除・再起動・namespace・UTF-8上限・異常値/障害拒否を12/12で確認した。
独立review APPROVED、追加probe26件と親の再実行12/12・失敗skip0、root/CF型・scoped lint・source監査成功。RED/flag-ON/除去後の元TAPはprivate `.wrangler/task-7.1/`。
actual Free適用、OpenNext外側の障害伝播、renderer CPU、profile統合、remoteは7.2以降の未検証事項。local quota注入をprovider上限の実測と扱わない。
