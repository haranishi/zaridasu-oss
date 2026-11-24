# (5) サービス障害 runbook

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md) FR-220-07 / AC-10
> 索引・共通初動: [README.md](./README.md)　|　証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
> データ損失時の引き継ぎ先: `docs/runbooks/backup-restore.md`（REQ-217 で整備予定）
> AI 停止時: [`gemini-key-rotation.md`](../gemini-key-rotation.md) / [`ai-model-rollback.md`](../ai-model-rollback.md)
> 下敷き（Obsidian・読み取り専用）: `07_Incident_Response` / `32_Backup_BCP`（データ損失時）
> 最終確認日: **2026-06-16**

---

## これは何か

本番（`zaridasu.com`）のダウン・主要機能の停止・表示崩れ・データ損失の疑いに対応する手順書。
記録・保全 → 切り分け → 一次連絡 → 暫定回避 → 復旧 → 検証 → 事後記録までを扱う。

## 目的・背景

障害はセキュリティ起因（攻撃・乗っ取り・漏洩キーによる破壊）と**区別がつかないことがある**。
そのため本 runbook は「ただの障害」と決めつけずに攻撃の可能性を検討させる構成にし、データ損失時は
復元 runbook と侵入経路対応の両方へ分岐させる。

## 主要な決定事項（要点）

- **データ損失が疑われるなら、確認 / 保全の前に復旧操作（再デプロイ・再作成）をしない。** 上書きで復元不能になり得る。
- **不審な削除は侵入経路を塞いでから復元する**（塞がずに復元すると再度破壊される）。
- **プロバイダ障害か自分の変更かを先に判定する**（各社 Status を見る）。プロバイダ障害なら復旧待ち + 一次連絡に切り替える。
- **AI が止まっても投稿フロー自体は AI 非依存**で受け付けられる。この前提で被害を最小化する。
- 直近デプロイ起因なら **Vercel でひとつ前の正常デプロイにロールバック**する。
- 利用者に**復旧時刻・原因は確約しない**（一次連絡は「確認中」）。復旧後に続報を出す。
- **暫定回避のまま放置しない**（終了条件で恒久対策への置き換えを要求する）。

## 各部品

- [01-when-to-use-and-first-response.md](./05-service-outage/01-when-to-use-and-first-response.md) — いつ使うか（ダウン / 主要機能停止 / 表示崩れ / データ損失の疑い）とセキュリティ起因との区別、初動チェックリスト 8 手順、やってはいけないこと。
- [02-triage.md](./05-service-outage/02-triage.md) — 切り分け表（症状 → まず見る → 推定原因と次の手）と各社 Status の確認先。
- [03-detailed-steps.md](./05-service-outage/03-detailed-steps.md) — 詳細手順 Step 1〜6（記録・保全の件数スナップショット SQL、影響範囲特定、一次連絡、暫定回避の分岐、データ損失時の引き継ぎ、検証）。
- [04-exit-criteria-and-links.md](./05-service-outage/04-exit-criteria-and-links.md) — 終了条件チェックリスト（復旧確認・原因特定・整合チェック・続報・恒久対策）と関連リンク。
