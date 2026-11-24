# R2 を使わないローカル候補

Task 7.2 / 要件 R1・R2・R4・R5・9.7、設計9.7、実行契約9.7.1–9.7.4。
既存の R2 プロファイルは保持する。この候補の実行先は新しい private licensed build。
対象アカウントの一致とローカル専用ダミー D1 ID を入力で明示する。
入力 JSON は private (0600)、`mode: local-prototype`、`localDatabaseIdOnly: true`、
`freeAccountVerified: false` とする。実在資源・Free 適用の証明には使わない。

## ローカル手順

不変のライセンス確認済み export を新規コピーし、記録したファイルだけを overlay する。
`.git`、`.env`、認証設定、以前の依存・生成物をコピーしない。同一 lock で `npm ci` を行う。
`free-profile.mjs` のコマンドはすべてローカル専用。

```sh
node scripts/cloudflare/free-profile.mjs prepare /private/selected-local.json
node scripts/cloudflare/free-profile.mjs build
node scripts/cloudflare/free-profile.mjs finalize
node scripts/cloudflare/free-profile.mjs types
node scripts/cloudflare/free-profile.mjs verify
```

`build` は実際の Next/OpenNext build と静的 headers 生成を行う。
`finalize` は実 build の ISR 署名 token を private module に書き、3 Worker を dry-run する。
`verify` は profile が無ければ失敗し、native D1・SQLite DO・Images・workerd・ブラウザを使う。
型の private 生成結果は module scope に閉じ、公開 origin や個人 ID を型へ保存しない。

## 維持する境界

入口 Worker は全 asset を署名付き Secure/HttpOnly/SameSite Cookie で保護し、
private/no-store/noindex と self CSP を返す。実アプリの Auth と役割/IP 検査は renderer に残る。
renderer は別 script の SQLite DO。backend と renderer の public/default 配信は無効。
Cookie・Origin・body stream・framework headers・複数 Set-Cookie・redirect を維持する。
入口が署名した元 CF IP だけを復元し、偽装 internal/XFF/Vercel 値を採用しない。
DO state の本物の `waitUntil` を使い、D1 エラーは OpenNext が捕捉しても外側で 503 にする。
要求間で描画がまとまる場合も、所有者の継続処理と失敗を待つ。共有するのは完了と失敗の状態だけ。
Cookie・主体・環境は要求ごとに保つ。on-demand ISRは実framework tokenで通常描画と分ける。
読み取り/書き込み障害をそれぞれ冷たいキャッシュへの8件並行要求で検査し、解除後の同一workerdでの回復も確認する。
テスト専用 entry が native binding の周囲へ quota を注入し、本番 entry には入らない。
合成 backend の公開集計 count だけを試験で替えられ、従来の既定値と Auth は保持する。

## 未検証の条件

ローカル合格は実アカウントの Free 適用、実 quota、remote CPU の合格を意味しない。
DO CPU の公式30秒表記と Workers Free 10ms 継承記述は未解決。
Free 確認後に入口/renderer の cold/warm SSR と日本語/emoji OG を remote 実測する。
プラン・全 binding・同一 account の証拠が不明なら remote を拒否する（task 7.3）。
remote 配備・実測（task 7.5）、本番移行、課金変更、R2 有効化はこの CLI の対象外。


## 成果物の監査

最終検証は不変入力と明示 overlay のハッシュを再照合し、元8画像・公開 source map・秘密の混入を拒否する。
`free-artifacts.mjs` に baseline・最終 overlay manifest・作業 source・private build の4パスを渡す。
検出値はRAM内だけで扱い、現在のNext生成鍵とコードを区別する。multipartはJS MIME部の正確な位置を検査する。
文字列・コメント・正規表現・templateや不明位置はコードとして除外しない。値や生成コードをログへ出さない。
監査の字句解析は固定Next依存に同梱のAcornを使う。実際の生成鍵は秘密情報として維持する。
疑いが出た旧buildと派生物は保持して配備対象から外し、新しい空directoryで全生成鍵を作り直す。

## Free証拠と配備物の読取検査（7.3）

```sh
node scripts/cloudflare/free-preflight.mjs refresh /private/preflight-input.json
node scripts/cloudflare/free-preflight.mjs inspect /private/preflight-input.json
```

入力には`selectionFile`・`buildRoot`・`baselineFile`・`overlayFile`・`validationFile`・
`inventoryFile`・`approvalFile`・`quarantineFiles`を指定する。証拠JSONは0600にする。
`inspect`は`accountFile`の保存済みmetadataを使い、`refresh`は既存Wrangler認証で固定GETを読む。
認証値・providerの生応答はRAMだけで扱い、Wranglerのdisk logとmetricsを無効にする。
結果はprivate `.wrangler/task-7.3/`へ新規保存する。DENYはexit1、入力/ツール不正はexit2。
Freeの明示証拠がない403・空の契約・standard usage_modelをFreeへ変換しない。
UNKNOWN/Paid・古い証拠・account/role/資源名不整合・未対応binding・候補改変・隔離を拒否する。
公開側の秘密/元画像混入、未分類や出所不明のprivate鍵、source/config/artifactの不一致も拒否する。
backend-assetsは10ファイルの名前とbaseline由来のbytes/hashを検証し、追加・欠落・改変・リンクを拒否する。
markerはlicensed exportのLeaflet画像を出所とする。導出証拠を候補digestへ含め、inventoryと合計件数を分けて示す。
local専用ダミーIDはFree証拠があってもremote候補にしない。このコマンドにremote書込み機能はない。
