# (1) シークレット / 鍵漏洩 runbook

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md) FR-220-03 / AC-04
> 索引・共通初動: [README.md](./README.md)　|　証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
> 下敷き（Obsidian・読み取り専用）: `23_Leak_Response_Playbook` / `07_Incident_Response`
> 復旧操作の相互参照: [`gemini-key-rotation.md`](../gemini-key-rotation.md)（Gemini キー復旧）
> 予防の相互参照: [REQ-210](../../requirements/REQ-210-ci-supply-chain-sast-secret-scanning.md)（CI の secret scanning）
> 最終確認日: **2026-06-16**

---

## これは何か

API キー・service-role・トークン・秘密鍵をコミット / 送信 / 露出してしまったときの対応手順書。
記録・保全 → 発行元での失効 / ローテーション → 悪用痕跡の確認 → 復旧と Git 履歴の対応 → 再発防止までを扱う。
ザリダスで管理している秘密の一覧と、それぞれの失効先も含む。

## 目的・背景

秘密は失効させない限り漏洩が継続する。一方で履歴削除を先にやっても、push 済みの値は既にクローンや
scanning bot に渡っており取り返せない。この非対称性から、**「まず失効、あとで履歴」**という順序を
runbook として固定している。

## 主要な決定事項（要点）

- **最重要原則: push / 送信した秘密は「漏洩済み」とみなす。**「private だから」「すぐ消したから」は理由にならない。
- **順序を逆にしない。** 発行元で失効 / ローテーション → その後に Git 履歴の対応（force push / filter-repo / BFG）。
- **値は絶対に書かない。** 識別はプロバイダ名・変数名・末尾数文字・キー ID で行う（NFR-220-01）。
- **公開された / 悪用痕跡あり / 影響が極大（service-role・DB 接続・Resend）なら即時失効。** private のみ・痕跡なしなら切替後失効でダウンタイムを避ける。
- **`SUPABASE_SERVICE_ROLE_KEY` は最重大**（RLS をバイパスする全権）。rotate は全 Edge Function に波及するため差替後に主要機能を確認する。
- **`WEBHOOK_SECRET` は Supabase Secrets と DB Webhook 設定の両方を同時更新**する（片方だけだと落ちる / 素通りする）。
- **Secrets の更新は Dashboard で直接編集**する（CLI / チャットは履歴に残る）。
- 個人データ流出の可能性が出たら 04-personal-data-breach を主 runbook に切り替える（報告義務の判断が要る）。

## 各部品

- [01-when-to-use-and-first-response.md](./01-secret-leak/01-when-to-use-and-first-response.md) — いつ使うか（コミット / チャット / scanning アラート / `NEXT_PUBLIC_` 混入）、最重要原則、初動チェックリスト 8 手順、やってはいけないこと。
- [02-secret-inventory-and-revocation-policy.md](./01-secret-leak/02-secret-inventory-and-revocation-policy.md) — 対象シークレット表（変数名・用途・配置 / 発行元・漏洩時リスク・失効先）と「即時失効 vs 切替後失効」の判断基準。
- [03-detailed-steps.md](./01-secret-leak/03-detailed-steps.md) — 詳細手順 Step 1 記録・保全 / Step 2 発行元での失効（プロバイダ別）/ Step 3 影響範囲の特定 / Step 4 復旧と Git 履歴の対応。
- [04-exit-criteria-and-links.md](./01-secret-leak/04-exit-criteria-and-links.md) — 終了条件チェックリスト（失効確認・主要フロー動作・痕跡確認・再発防止・タイムライン）と関連リンク。
