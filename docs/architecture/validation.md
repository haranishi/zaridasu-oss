# 検査ごとに確かめられる範囲を読む

ザリダスは、TypeScript/UI、実ブラウザ、Deno、SQL/RLS、Rustを別の検査系で確認する。
全てを`npm test`へ含めているわけではない。以下は現行検査の設計であり、今回すべてを実行したという記録ではない。
実際の結果は対象PRのChecksで、未実施・SKIPも含めて確認する。
元repoの `.agent-harness/runs/` は私的な実行記録であり、この公開リポジトリには同梱しない。

## 最初に変更する層を選ぶ

| 変更領域 | 主な検査 | 成功しても残る範囲 |
|---|---|---|
| 説明文書・steering | 参照先、100行上限、JSON、差分、秘密混入、コードとの対応 | 実画面・本番稼働は証明しない |
| UI・hook・純粋関数 | 対象Vitest、型、lint、必要なPlaywright | 実DBのRLSや外部事業者との接続 |
| 公開データ・非公開権限 | 静的検査、pgTAP、公開/本人/adminのケース | 本番設定・全migrationの新規DB順次適用 |
| Edge Function | Deno check/test、必要な接続テスト | webhook・cron・鍵・実配信の設定 |
| 水域計算 | Cargo fmt/clippy/test、Wasm再現、JS等価性 | 実地のデータ品質・回線・描画速度 |
| chunk・読み込み | production build、size、ルート予算、Lighthouse、対象E2E | 本番端末の体感全体 |

通常の入口は[package.json](../../package.json)と[precheck.mjs](../../scripts/precheck.mjs)。
precheckはローカルで回せる検査をまとめるが、coverage・Rust・DB・本番照合を全て代替する入口ではない。
CI側の実行条件・warningとの違いは[運用](operations-ci.md)を参照する。

## VitestはUIとデータ境界を速く確かめる

[vitest.config.ts](../../vitest.config.ts)はjsdom＋Testing Libraryを基本とし、sourceの`__tests__`とscript自身のテストを対象とする。
[vitest.setup.ts](../../vitest.setup.ts)がNext router、matchMedia、ResizeObserverを置換し、Web Cryptoを補う。
`tests/e2e`と`supabase/functions`はVitestから除外する。必要なテストはnode環境を指定できる。
主プールはvmThreads。`window.location`の差替えが必要なerror画面だけ別プールへ分ける。
coverageはV8でstatement 60%、branch 47%、function 51%、line 63%を強制する。全コードの完全網羅を意味しない。

| 配置 | 契約の例 |
|---|---|
| [src/lib/__tests__](../../src/lib/__tests__/) | 入力検証、画像、offline migration、秘密のスクラブ、送信用フィールド |
| [src/hooks](../../src/hooks/)・[components](../../src/components/)内`__tests__` | hookの競合、状態遷移、表示、a11y、送信失敗 |
| [水域テスト](../../src/features/water/lib/__tests__/) | 島・距離境界、公開記録数、コンパイル済みWasmとの等価性、fallback |
| [水域dataテスト](../../src/features/water/data/__tests__/) | 公開座標・exact count、写真の変換/削除、再送・審査入力 |
| [scripts/__tests__](../../scripts/__tests__/) | SW生成版、SQL正規化、非公開表検査そのものの回帰 |

Supabase query-builderのfakeやfetch mockの合格は、実DBの権限・外部APIの応答品質を保証しない。
サーバーAPIの[nearby-water tests](../../src/app/api/nearby-water/__tests__/)も上流通信を置換して失敗・cache・形式を検査する。

## Playwrightは本番buildをローカルブラウザで動かす

[playwright.config.ts](../../playwright.config.ts)はChromiumのみ、worker 1、CIでretry 1回と最大失敗5件を設定する。
通常は`npm run build`後のローカルNextを起動し、失敗時traceとscreenshotを保持する。
`E2E_BASE_URL`指定時は起動を省く。テスト専用Auth transportはplaceholderホストと固定fake tokenだけを扱う。
このtransportを本番build・配備へ読み込まない。

| テスト群 | 主な対象 |
|---|---|
| home/smoke/auth/admin-* | ホーム、基本遷移、認証・管理ガードと管理画面 |
| intro/onboarding-*/lp | 紹介、必須案内、初回の導線、既存LP |
| post/post-submit/survey-request | 詳細、投稿、調査依頼の画面と送信 |
| map-popups/map-settings | popup重なり、地図設定 |
| fieldwork/private-spots-and-routes | 本人の調査、非公開スポット、外部経路 |
| nearby-water/water-discovery | 候補・計画追加・写真原票・admin審査・画面寸法 |
| pwa-delivery/error-boundary | manifest配信とリンク、画面例外からの復帰 |

実装は[tests/e2e](../../tests/e2e/)からたどる。特に水域・調査のテストは合成データと通信遮断で実サービスへの書込みを防ぐ。
一方、manifest配信テストだけでSWの全ライフサイクルや実機の圏外送信まで検証済みとはしない。
現在の構成はSafari/WebKit、Firefox、iOSインストール、通知許可UIを網羅しない。

## Deno・SQL・Rustはホストごとの契約を確かめる

[Edge Functions](edge-functions.md)はDeno 2、独立lockfile、全TSの`deno check`後、`cached-only --no-check`でtestする。
依存CDNへのアクセスをtest時に止める指定であり、`--allow-net`自体を禁止するsandboxではない。
各テストのfetch差替えを確かめ、実配信・実課金の評価と分ける。

[pgTAP tests](../../supabase/tests/)はschema.sqlを土台にし、Auth/Storage/Vault/pg_netをスタブする。
Supabase既定GRANT後に[reapply-after-grants.txt](../../supabase/ci/reapply-after-grants.txt)指定migration等を再適用し、公開列とRPC権限を復元して検査する。
全migrationを空DBへ順次適用する再現試験ではなく、本番のcronやStorageサービス本体の試験でもない。
schema-driftはSQL適用と型生成のsmoke、schema:checkは選ばれた列挙値の同期、migration-gateは本番適用記録との照合で、互いに目的が違う。

Rustは[Rust tests](../../rust/water-geometry/src/tests.rs)と[WasmのJS比較](../../src/features/water/lib/__tests__/waterGeometry.test.ts)を組み合わせる。
ABI破損、1000点、島・MultiPolygon、150m境界、取消・Worker失敗を扱う。配布物の再現性は`wasm:check`で別に確かめる。

## 実サービスでだけ確かめられる項目を残す

Authメール/CAPTCHA、Storage RLS、DB migration適用、webhook secret、cron、Resend到達、Push、Geminiの品質・費用、backup復元は専用確認が要る。
[AI評価fixture](../../tests/fixtures/)と`eval:ai`は外部APIを消費する。合成ベンチはDB・通信・本番の速度を測らない。
Lighthouseはa11y/SEO/CLSのerrorを残すが、performanceスコアとmobile TBTはwarning。LP contrast等にも限定例外がある。
エラーをwarningへ変えれば品質が確認できたことにはならない。検査が対象0件やSKIPになっていないかも読む。
