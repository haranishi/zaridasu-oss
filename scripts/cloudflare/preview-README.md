# 隔離previewのローカル準備

2026-11-16：このR2版はlocal回帰検査と履歴のために保持する。R2有効化依頼は撤回済み。
超過課金を許可しない現行候補は[R2なしの手順](free-README.md)を使い、Free証拠が揃うまで配備を拒否する。

対象はcloudflare-migration 6.12、requirements.md R1/R2/R4/R5/9、design.md 9と実行契約9.2〜9.6。
通常のCloudflare fixtureやVercel本番とは別の入口を使う。アプリの認証・権限判断は既存実装を通る。

## ライセンス済みexportへ明示したoverlayだけを加える

元画像8点を代替済みのsource exportを新しいprivateディレクトリへコピーする。
元exportと以前のbuildは保持し、既存node_modulesの再利用やdirty HEADのexportは行わない。
overlayは`cloudflare/preview.worker.ts`・`preview.backend.ts`・`preview/`と、本ディレクトリの`preview-*`だけ。
source revision、全source/overlayのpath・size・SHA-256をprivate証拠へ記録してから同じlockで`npm ci`する。
`prepare`はOSS_ASSET_MANIFESTの8置換、実際の代替bytes、license noticeを確認し、不一致を拒否する。

選択済みアカウントのmetadataを、Git対象外の0600 JSONへ保存する。必要なキーは次のとおり。
`accountId`・`expectedAccountId`・`workerName`・`backendName`・`bucketName`・`subdomain`。
アカウントIDに既定値や自動切替はなく、二つのIDの不一致を拒否する。bucketはworker名に`-cache`を付ける。
ID・実名・パスワードをこの文書やsourceへ記入しない。

```sh
node scripts/cloudflare/preview-profile.mjs prepare /private/selected-preview.json
node scripts/cloudflare/preview-profile.mjs build
node scripts/cloudflare/preview-profile.mjs finalize
node scripts/cloudflare/preview-profile.mjs verify
npm run cf-typegen
npm run type-check:cloudflare
npm run type-check
```

`build`はNext/OpenNext、`finalize`は生成されたNextのISR tokenの組込みと2つのdry-run。
既存Next buildを変えずpreview wrapperだけ直す場合は`finalize`から再開する。
`types`でpreview固有のWrangler型を再生成できる。通常の型と混ざらないmodule形式に変換する。
`verify`は合成値だけの単体検査と、実workerdの2 Worker・R2/DO/IMAGES・Chromiumを実行する。
検証にはprivate HOMEと既存のPlaywrightブラウザーcacheだけを使い、本番環境変数を継承しない。
previewのprivate profileがない通常checkoutでは、既存`test:cloudflare`にnative preview検査は加わらない。
profile専用検査は明示コマンドで実行し、未生成の場合は失敗する。黙ったskipは行わない。

起動計測はローカルで行う。専用configの実multipart bundleを明示して、別の既定Workerを計測しない。
`--workerBundle`へ渡すのは下記のmultipart出力であり、dry-runのJSファイルではない。

```sh
WRANGLER_SEND_METRICS=false wrangler deploy --dry-run \
  --config .wrangler/preview-profile/app.json \
  --outfile .wrangler/task-6.12/app.multipart.bundle
WRANGLER_SEND_METRICS=false wrangler check startup \
  --workerBundle .wrangler/task-6.12/app.multipart.bundle \
  --outfile .wrangler/task-6.12/app-startup.cpuprofile
```

## remoteの境界

このCLIはremote資源を作らない。R2を必要とする旧案は、現行の超過課金禁止条件では配備対象外。
課金契約・DNS・本番鍵・実データ・既存Worker/bucketの変更や削除は対象外。
backendはworkers.dev/preview URLを無効にし、appのService Bindingからだけ利用する。
appは全assetをWorkerへ通し、専用の署名Cookieがなければ401。応答はprivate/no-store/noindex。
専用パスワードは新しく生成してGit対象外0600ファイルへ保存し、Wrangler secretへstdinで渡す。
パスワードをargv・URL・チャット・ログへ出さない。利用者へは通常URLとprivate credentialファイルの場所を伝える。
`/__preview`が入力画面。専用CookieはSecure/HttpOnly/SameSite=Strict、有効期限8時間。
`POST /__preview/identity`はゲート通過と同一Originを要求し、合成actor a/b/adminだけを発行する。
アプリsessionはブラウザーSDKのCookie契約を保ち、切替時は古い本体と分割chunkを失効する。
これは検証用の合成identityで、本番Authの代替や実利用者の移行ではない。

サーバーfetchは合成backendへ閉じ、未知の経路・origin・redirectは拒否する。
ブラウザーCSPも外部通信を閉じるため、外部地図・AI・メール・監視は使えない。
合成backendは限定した公開集計・本人profile・Authと記録済みlicensed素材だけを返す。他は拒否する。
remote probeは新規previewだけ、250要求/100MB以内とし、remote startup・binding・実URLを記録する。
local startupはremoteの合格証拠にならない。custom-zone画像source設定と未訪問Drawerの圏外制限は別の残件。
