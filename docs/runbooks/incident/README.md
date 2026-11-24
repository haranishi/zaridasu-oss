# インシデント対応 runbook（索引・共通初動）

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md)
> 最終確認日: **2026-06-16**（法令の数値・各社 UI / フォーム URL は変わり得る。後述「要確認マーカー」を参照）
> 対象 PF: ザリダス（Next.js 15 / Supabase[Auth・DB・Storage] / Vercel / GitHub / Sentry / Resend / Gemini）

---

## これは何か

ザリダスで事故が起きたときに**考えずに上から順に読んで動く**ための索引。共通初動の 8 ステップ、
共通 NG、事象からケース別 runbook への振り分け、証拠保全と連絡先への導線をまとめている。

## 目的・背景

事故は「本番が見られない・頭が真っ白・一人」という状況で起きる。だから判断を現場に委ねず、
順序を固定した手順として置く。Markdown 単体で読めるよう書いてあり、**スマホ・印刷でも初動と連絡先が
読める**ことを意図している（NFR-220-02）。いざというときに開けるよう、リポジトリの場所を控えておくこと。

## 主要な決定事項（要点）

1. **緊急時ほど削除を急ぐと証拠を失う。** 消す・上書きするより先に記録・保全する。
2. **push / 送信した秘密は漏洩済みとみなす。**「たぶん大丈夫」では扱わない。
3. **事実確認の前に賠償・原因・影響範囲を確約しない。** 一次連絡は「確認中」に留める。
4. **秘密値・実ユーザーの PII を runbook・チケット・スクショ・チャットに残さない**（識別はメタデータで / NFR-220-01）。
5. **判断に迷ったら止めて相談する。** 公的窓口・各社サポートは無料。法令該当性は専門家へ。
6. **監査ログだけを根拠に「不正なし」と結論づけない**（`writeAuditLog` は fire-and-forget で欠落し得る）。
7. **billing アカウントをいきなり無効化しない**（破壊性が高く復旧不能・データ喪失につながり得る）。
8. **複数ケースに該当したら、最も被害が重いもの（通常は個人データ漏洩）を主 runbook**にし、関連 runbook の封じ込めも並行する。
9. 知見は**二層**で維持する（リポジトリ層＝PF 固有の手順 / Obsidian 層＝汎用・法令・演習の読み取り専用の下敷き）。

## まずどこを開くか（詳細な対応表は部品 03）

- 秘密 / 鍵を出してしまった → [01-secret-leak.md](./01-secret-leak.md)
- 身に覚えのないログイン・admin 操作 → [02-account-takeover.md](./02-account-takeover.md)
- 利用量・請求の急増 → [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md)
- 個人データが出た / 出た疑い → [04-personal-data-breach.md](./04-personal-data-breach.md) **(最重要)**
- 本番ダウン・データ損失の疑い → [05-service-outage.md](./05-service-outage.md)
- 証拠の取り方 → [evidence-preservation.md](./evidence-preservation.md)　|　連絡先・文面 → [contacts.md](./contacts.md)

## 各部品

- [01-how-to-use-and-principles.md](./README/01-how-to-use-and-principles.md) — §0 この runbook の使い方（読む順序・各 runbook の構成・印刷前提）と全 runbook 共通の大原則 5 項目。
- [02-common-first-response-and-donts.md](./README/02-common-first-response-and-donts.md) — 共通初動チェックリスト 8 ステップ（記録 → 保全 → 封じ込め → 影響範囲 → 一次連絡 → 通報 → 復旧 → 再発防止）、ステップごとの最小アクション、やってはいけないこと（共通 NG）。
- [03-runbook-routing-and-file-list.md](./README/03-runbook-routing-and-file-list.md) — 事象 → 該当 runbook 対応表（症状から引ける全文の振り分け表）と、このフォルダのファイル一覧。
- [04-two-layer-structure-and-review.md](./README/04-two-layer-structure-and-review.md) — リポジトリ runbook と Obsidian 知見の二層構造（参照する Obsidian ノート一覧）、関連する他 runbook / 要件、⚠️要確認マーカーと見直しタイミング。
