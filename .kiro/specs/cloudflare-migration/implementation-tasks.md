# 2026-11-14からの実装タスク

要件9.1–9.6・設計9・[実行契約](execution-20261114.md)に従う。過去の全移行バックログは[tasks.md](tasks.md)。
独立したタスク健全性レビューで、runtime fixtureの先行、検証単位の分割、DB用依存の隔離を反映した。

## 6. 非本番のWeb移植とDB候補検証

- [x] 6.1 依存台帳と読取metadata、権限・対象アカウント・非本番境界を照合する。
  - 成果：source/liveの区別、秘密値/実レコードを含まない構成・容量記録。9.1。
  - _Boundary:_ 仕様・台帳・private metadata。DB/設定は変更しない。未選択アカウントはremoteのみ保留。
- [x] 6.2 OpenNext toolchain、Node OG、Worker設定・型を導入し、build/dry-runと圧縮容量を実測する。
  - 既存next buildを維持。9.2、9.4。_Depends:_ 6.1。
  - _Boundary:_ package/lock、Next config/OG、OpenNext/Wrangler/型、build script、ignore。既存glob防御を維持するtools内のconsumer別adapterと回帰検証を含む。
- [x] 6.3 合成Auth/backend、非本番envとlocal cacheを備えたworkerd起動/リセットの検証harnessを作る。
  - 実レコード・本番鍵なしでrepeatableに実行。9.2、9.3。_Depends:_ 6.2。
  - _Boundary:_ cloudflare試験fixture/設定/スクリプトと、検証で使う既存toolchain依存の明示宣言。実アプリの認可をstubへ置換しない。
- [x] 6.4 信頼する配備元/IP、認証拒否とCookie更新・private no-storeを移植・検証する。
  - 偽装Vercel/XFFでCloudflareの制限を回避できない。9.3。_Depends:_ 6.3。
  - _Boundary:_ runtime helper、proxy、認証middleware、Wrangler信頼vars/生成型と既存認証fixture・境界試験。
- [x] 6.5 preview監視停止とSentry収集抑止をWorker wrapperへ渡し、静的headersを維持する。
  - previewの外部送信なし、dataCollection/scrub維持。9.3、9.4。_Depends:_ 6.4。
  - _Boundary:_ 環境helper、Sentry設定/Worker entry、Next env/preview build、layoutのGTM起動条件、Wrangler/型/CF型検査、public/_headers生成とprivacy/配信試験。
- [x] 6.6 workerd上で保護経路・PNG・画像origin・ISR・Wasm/SWを統合検証する。
  - Node mockだけで合格とせず、未対応/制限は証拠と区別。9.2–9.4。_Depends:_ 6.5。
  - _Boundary:_ 実runtime検証と、その観測で判明した今回の移植差分。
- [x] 6.7 Turso/D1の合成fixtureと隔離SDK/CLI環境を準備する。
  - 9.5。_Depends:_ 6.1。_Boundary:_ scripts/migration/内の独立manifest/lock・local DB。現行data層は変更しない。
- [x] 6.8 DB候補でanonymous/A/B/admin/internalの許可/拒否と原子的更新・競合を検証する。
  - 正確な位置・非公開tokenを公開投影へ出さない。9.5。_Depends:_ 6.7。
  - _Boundary:_ local試作・試験。アプリ側認可/transaction契約の検証であり本番採用は未確定。
- [x] 6.9 DB候補の再送/部分失敗/復元を比較し、Auth/UID/offlineを含む採用条件を記録する。
  - 9.5。_Depends:_ 6.8。_Boundary:_ local試験・比較証拠。実ユーザーの移送なし。
- [x] 6.10 Cloudflare検査をCIへ加え、証拠と切替手順を揃えてdevelop向けPRを作る。
  - 8つの必須CIとVercel/migration gateを維持。9.6。_Depends:_ 6.6、6.9。
  - _Boundary:_ CI・手順・PR。本番DNS、正本、Git公開の変更なし。
- [x] 6.11 代替画像exportを生成し、非本番設定でbuild・秘密/元画像の混入検査を行う。
  - 9.6。_Depends:_ 6.10。_Boundary:_ 公開候補profileとprivateな生成成果物。
- [ ] 6.12 選択済みアカウントの権限/plan/bindingを照合し、隔離previewを配備・検証する。
  - noindex、本番鍵なし、cache/画像/権限の実測。9.6。_Depends:_ 6.11。
  - _Account:_ 2026-11-15、本人が対象アカウントを選択。認証・管理者権限・対象IDをprivate metadataで照合済み。
  - _Remote Gate:_ 9.7の超過課金禁止を優先する。R2有効化依頼は取り下げ、新候補のFree適用・機能維持を確認するまでremote配備しない。
  - _Blocked:_ 旧R2 profileは超過課金禁止に適合しない。PR193のlocal準備は反映済みだが、remote実測は未完了。7節へ継続する。
  - _Boundary:_ 新規非本番Worker/cacheのみ。本番DNS/既存資産削除/課金プラン変更なし。

## 7. 追加課金を発生させない候補

本人が2026-11-16に実行を了承。[9.7の契約](zero-overage-execution-20261116.md)で進める。

- [x] 7.1 D1 cache候補をnative bindingで実装・検証し、Free上限時の拒否条件を記録する。
  - 9.7.1/9.7.2/9.7.4。_Depends:_ 6.11。_Boundary:_ cache adapter/schema・native検査・仕様。remoteなし。
- [x] 7.2 R2なしのprofileを実build/workerd/browserで検証し、必要時はrenderer DOも試す。
  - 9.7.1〜9.7.4。_Depends:_ 7.1。_Boundary:_ 専用entry/config/build/harness/型とlicensed private build。既存R2版を保持する。
- [x] 7.3 同一accountと全bindingのFree適用を照合し、不明・Paid・証拠不整合でremoteを拒否する。
  - 9.7.1/9.7.4。_Depends:_ 7.2。_Boundary:_ 読取preflight・拒否検査とprivate metadata。課金変更なし。
- [ ] 7.4 既存必須CIを維持してdevelop向けPRと反映確認を完了する。
  - 9.7.4。_Depends:_ 7.2、7.3。_Boundary:_ CI/文書/Git。local準備とremote合格を分ける。
- [ ] 7.5 Free適用確認後に新規隔離previewを配備・実測する。
  - 9.7.4。_Depends:_ 7.4。_Boundary:_ 新規非本番資源だけ、250要求/100MB以下。不明ならblockedを保持する。

## Implementation Notes

[6.1〜6.12の記録](implementation-history.md)と[検証記録](implementation-verification.md)を引き継ぐ。
7節の各taskは独立review・親の検証・選択的commitの順で進め、remote未完了を完了にしない。

- 7.1証拠：native D1 12/12・失敗skip0、独立review APPROVEDと追加障害probe26件、親の再実行12/12。型/lint/source監査成功。quotaは注入であり、実account Free・CPU・remoteは未検証。
- 7.2証拠：[追加課金なし候補の検証](zero-overage-verification-20261116.md)。独立review APPROVED、pure13/native6/親のdefault64成功。並行read/write各8件・後続要求の503と同一workerd回復を確認。remoteは未検証。
- 7.3証拠：拒否検査29件と既存13件、独立reviewの54件、親default93件が成功。全5製品UNKNOWN・LOCAL_ONLYで実判定DENY、3391配備ファイルを照合。実Free・remote CPUの合格ではない。
