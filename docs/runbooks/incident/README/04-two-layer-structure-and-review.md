## 二層構造（リポジトリ runbook ↔ Obsidian 知見）

インシデント対応の知見は **二層**で維持する（REQ-220 FR-220-11 / AC-09）。

- **この `docs/runbooks/incident/`（リポジトリ層・PF 固有）**: ザリダスの実テーブル名・実ダッシュボード操作・実 secret 名に落とし込んだ「読んで動ける」手順。**対応時はまずこちらを開く。**
- **Obsidian `02_notes/Security_Research/`（知見層・汎用 / 法令 / 演習）**: 一般原則・法令の背景・机上演習。**読み取り専用の下敷き**として参照する（本 REQ では Obsidian ファイルは変更しない）。
  - `07_Incident_Response`（初動の共通順序・ケース別の気づき方/初動/その後・公的窓口）
  - `23_Leak_Response_Playbook`（認証情報漏洩の判断・失効基準・終了条件・机上演習）
  - `27_Evidence_Preservation_Playbook`（原本・ハッシュ・chain of custody）
  - `13_Monitoring_Logging`（検知・ログの取り扱い）
  - `18_Cloud_IAM_Billing_Guardrails` / `25_Cloud_Cost_Abuse_Defense`（課金ガードレール・段階的 kill switch）
  - `32_Backup_BCP` / `11_Database_Hardening`（バックアップ・復元）

---

## 関連する他 runbook / 要件（相互参照）

- 平時運用 runbook: [`gemini-key-rotation.md`](../gemini-key-rotation.md)（Gemini キー復旧操作） / [`ai-model-rollback.md`](../ai-model-rollback.md)（AI モデル切り戻し） / [`edge-function-deploy.md`](../edge-function-deploy.md)
- バックアップ / 復元: `docs/runbooks/backup-restore.md`（REQ-217 で整備予定。データ損失時の復元先）
- 関連要件: [REQ-210](../../requirements/REQ-210-ci-supply-chain-sast-secret-scanning.md)（secret scanning＝漏洩の予防） / [REQ-211](../../requirements/REQ-211-sentry-pii-scrubbing.md)（Sentry PII スクラブ） / [REQ-217](../../requirements/REQ-217-backup-bcp.md)（バックアップ / BCP） / [REQ-218](../../requirements/REQ-218-cloud-cost-guardrails.md)（課金ガードレール / kill switch）

---

## 要確認マーカーと見直し（最新性の担保）

法令の数値（個人情報保護委員会への報告期限・閾値・該当類型）と各社 UI / 復旧フォーム URL は改正・変更され得る。

- 本フォルダ内で **⚠️要確認** と付いた箇所は、対応時・執筆時に**必ず 2026 年時点の最新を公式一次資料で確認**し、確認日を更新する（NFR-220-03）。
- 法令該当性の最終判断は断定せず、必要に応じて専門家（弁護士等）・個人情報保護委員会に相談する。
- **見直しタイミング: 半期ごと（目安 4 月・10 月）**、および各社の重大な UI 変更・法改正を認知した都度。見直したら本書冒頭の「最終確認日」を更新する。
