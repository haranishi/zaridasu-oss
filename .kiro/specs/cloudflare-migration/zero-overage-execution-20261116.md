# 9.7：追加課金を発生させないWeb候補

2026-11-16に本人が超過課金を拒否し、無料枠で停止する構成の検証を依頼・了承した。
選択済みのアカウントを維持し、R2有効化依頼を取り下げる。利用する各Freeプランは確認し、証拠が揃うまでremoteを拒否する。
今回の了承は要件と検証の実行であり、未検証の機能縮小・本番切替・課金契約の承認ではない。

## 9.7.1 受け入れ条件

- 無料枠付き従量課金の見積りを、請求上限0の証拠と扱わない。
- 採用する各サービスは実際のFreeプランを確認し、枠超過時に自動課金せず失敗することを照合する。
- plan不明・Paid・古い証拠・アカウント不一致ではremote変更を拒否する。暗黙の有料fallbackを持たない。
- R2とpaid-only機能を新候補から外す。既存アカウントの契約・Worker・データを変更/削除しない。
- R1/R2/R4/R5と9.3/9.4の認証・信頼役割/IP・Cookie・no-store/noindex・秘密/元画像排除を維持する。
- ISRの更新/削除を保つ。古いbuildや削除済みcacheを復活させず、quota障害をcache missへ変えない。
- 限界時に失敗することを許容するが、保存成功の偽装や他サービスへの自動切替は許さない。

## 9.7.2 検証する構成

候補はWorkers Free、D1 Freeのcache、SQLite-backed Durable Objectsのqueueと必要時のrenderer、Images Free。
業務DBは引き続きSupabaseを正本とし、Turso/D1の全DB採用や実Auth/media移送とは分ける。
D1 cacheは主キー付きの小さな表を使い、bind値だけでread/upsert/deleteする。schema変更は明示する。
getはprimaryへ一貫した読取りを行い、value/lastModifiedを保持する。1件のJSONは1MiBまでに制限する。
D1行の上限2,000,000Bに余裕を持たせ、超過値・異常JSON・quota例外は黙って無視しない。
既存の検証済cacheは100 files/9,398,868B、最大166,710B。これは将来の全payloadの合格証拠ではない。
必要なら重いSSR/OGをrenderer DOへ閉じ、入口Workerは認証・asset配信・転送に絞る。
renderer DOのFree CPU枠は未確定の実験条件。公式の30秒表記とWorkers Freeの10ms継承記述が併存し、local成功で解消しない。
同じscriptからの静的importはglobal初期化を分離しない。startup・初回/安定時のrequest CPUを別に測る。
DOへ送る場合はprivate bindingでURL/method/body/Cookie/Origin/複数Set-Cookie/redirectを保つ。
信頼IPは偽装XFF/Vercel/internal headerを含め実際のhopで検証し、DO waitUntilを実行contextへ正しく接続する。no-op代替は使わない。

## 9.7.3 境界

対象はcloudflareのcache/runtime候補、専用profile/harness/検査、仕様と手順。
Next本体の機能縮小、認証・SQL正本の移行、DNS、本番配備、課金登録/upgrade、既存資源の削除は対象外。
final buildは権利未確認8画像を除く不変sourceへ、明示したoverlayだけを加えた新private copyで行う。
元source・以前のbuildは保持し、依存/生成物はSSDへ置く。本番キーや実データを使わない。
探索用の既存private runtime利用と、最終clean install/buildの証拠は区別する。

## 9.7.4 検証と配備の条件

native D1で永続化・更新/削除・並行操作・サイズ・異常/上限エラーを検査し、エラー注入と実quotaを区別する。
OpenNextの外側でもquota例外がcache miss/古いseed復活/更新成功へ変わらないか検証する。
Free適用確認後のremoteではingress/renderer各CPUをcold/warm SSR・日本語/emoji OGで測り、猶予による一時成功を合格にしない。
新profileで実Next/OpenNext build、dry-run/型、workerd/browser、ISR/画像/OG/actor切替を確認する。
APIでFreeが確認できない場合は不明を保持し、remoteなしでlocal準備とPRの検証を完了する。
remoteは新規非本番資源だけ、250要求/100MB以下。全bindingのFree証拠と同一accountのrole/候補名を再確認する。
local試験や公式説明だけで、実アカウントのFree適用・remote性能・6.12完了を主張しない。

## 公式根拠（2026-11-16確認）

- [D1料金](https://developers.cloudflare.com/d1/platform/pricing/)と[無料枠の停止](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)。
- [D1制限](https://developers.cloudflare.com/d1/platform/limits/)・[DO料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)・[DO制限](https://developers.cloudflare.com/durable-objects/platform/limits/)。
- [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)・[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)・[Images Free](https://developers.cloudflare.com/images/pricing/)。
- [支出上限](https://developers.cloudflare.com/billing/manage/spend-management/)はR2を含まず、invoice上限も保証しない。
