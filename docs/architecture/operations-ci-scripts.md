# scriptsを目的と副作用から探す

[package.json](../../package.json)は通常の入口、[CI](../../.github/workflows/ci.yml)は自動実行条件の正本。
この索引はscriptを読むための案内であり、ここに載っている操作を本番へ実行する許可ではない。
`scripts/__tests__`のscript自身の検証は[検証](validation.md)で説明する。

## ローカル検査とビルド

| 実装 | 入出力と意味 |
|---|---|
| [precheck.mjs](../../scripts/precheck.mjs) | lint・型・静的検査・unit・audit・秘密検査・Denoを順に実行。`--full`でbuild/size/E2Eも実行 |
| [build-sw.mjs](../../scripts/build-sw.mjs) | テンプレートの版識別子を置換して`public/sw.js`を生成。devでは固定版 |
| [build-water-geometry.mjs](../../scripts/build-water-geometry.mjs) | Rust/Wasmの生成・整合確認・再ビルド比較。`--verify`は生成せず確認 |
| [check-bundle-budget.mjs](../../scripts/check-bundle-budget.mjs) | .next manifestから各route・共通JSのgzip量を計算し、size-limit設定の空振りも検査 |
| [check-i18n-parity.ts](../../scripts/check-i18n-parity.ts) | jaを基準にen/ko/zhの翻訳キー集合を比較。翻訳の意味や自然さは検査しない |
| [check-schema-types-sync.ts](../../scripts/check-schema-types-sync.ts) | SQL CHECKの列挙値と手書きDB型のunionを照合。全スキーマ差分の検査ではない |
| [check-no-auth-route.mjs](../../scripts/check-no-auth-route.mjs) | 廃止auth経路への遷移と、サーバー側getSession利用を検出する |
| [check-private-tables-not-public.mjs](../../scripts/check-private-tables-not-public.mjs) | 非公開調査・希少種・水域原票を読む関数/trigger/view/公開経路を検査する |
| [normalize-migration-sql.mjs](../../scripts/normalize-migration-sql.mjs) | 引用領域を保ってSQLコメント・空白を正規化し、適用済みmigrationとハッシュ比較 |

precheckは外部コマンド不足をSKIPとして表示し、既定は最初の失敗で止める。`--all`は検査を最後まで試す。
緑でもcoverage閾値、Rust再ビルド、pgTAP、本番照合、Lighthouseまで全て確認したことにはならない。
高速側のauditとDeno依存取得も通信を使うため、名前だけで完全オフライン処理と判断しない。
`build-sw`は生成ファイル、buildは`.next`、coverageはレポートを書く。文書変更の確認に毎回全生成処理を回す必要はない。

## 合成ベンチと診断

| 実装 | 測るもの・測らないもの |
|---|---|
| [bench-post-loading.ts](../../scripts/bench-post-loading.ts) | 合成50/2000投稿のselect列、JSON/gzip量、parse時間。DB・通信・描画は除外 |
| [bench-map-rendering.ts](../../scripts/bench-map-rendering.ts) | 変更前後のlocalhostサーバーをChromium/CDPで比較。合成投稿・固定タイル、CPU/DOM/heapを測る |
| [bench-water-geometry.ts](../../scripts/bench-water-geometry.ts) | 合成水面のJSと実Wasm、梱包込み計算を比較。通信・Worker往復・地図描画は除外 |
| [diagnose-layout-shifts.mjs](../../scripts/diagnose-layout-shifts.mjs) | ローカルページのlayout shiftをブラウザで収集し、Lighthouse失敗の調査用JSONを書く |

比較は同じNode/lockfile・同じ入力・同じ時間窓を前提とする。
bench:mapは既に起動した2つのローカル本番サーバーが必要で、script自身はbuildしない。
これらの数値は実際の利用者の回線・端末・本番データを置き換えない。

## 実サービスへ接続する運用処理

| 実装 | 接続と副作用 |
|---|---|
| [check-migration-drift.sh](../../scripts/check-migration-drift.sh) | Supabase Management APIから本番migrationを読み、ローカルとの集合・内容・索引を比較 |
| [check-edge-deploy-lag.sh](../../scripts/check-edge-deploy-lag.sh) | 本番関数一覧とGit時刻を照合。全関数未配備と_shared波及も検出。配備そのものは行わない |
| [backup-db.sh](../../scripts/backup-db.sh) | DBを読み、暗号化dumpとchecksumを出力。平文dumpはEXIT trapで削除 |
| [backup-storage.sh](../../scripts/backup-storage.sh) | bucketを読み、tar化・暗号化。aws優先、rcloneへフォールバック |
| [restore-db.sh](../../scripts/restore-db.sh) | checksum検査・復号後、DRY_RUN以外はTARGET_DB_URLへSQL投入 |
| [restore-storage.sh](../../scripts/restore-storage.sh) | checksum検査・復号・展開後、DRY_RUN以外は指定Storageへ同期 |
| [calc-ai-cost.ts](../../scripts/calc-ai-cost.ts) | service keyでai_call_logsを読み、期間・関数・モデル別の推定額を表示 |
| [eval-ai-analysis.ts](../../scripts/eval-ai-analysis.ts) | fixtureの画像/音声をGeminiへ送り、precision/recall/F1と混同行列、評価JSONを出力 |

本番照合scriptは接続設定不足でskipできる。exit 0を「本番一致」と読む前にskip表示を確認する。
AI評価はAPIを消費し、コスト集計はコード内単価の概算で、請求書照合ではない。
復元は対象データを書き換えるため、検査のために通常のprecheckへ含めない。
設定識別子と送信対象は[外部サービス](external-services.md)、配備・復元の順序は[運用](operations-ci.md)を参照する。
