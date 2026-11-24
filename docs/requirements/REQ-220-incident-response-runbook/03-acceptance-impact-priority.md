## 受入条件

- [ ] AC-01: `docs/runbooks/`（例 `docs/runbooks/incident/`）に**インシデント対応 runbook 一式と索引**が存在し、索引から「事象 → 該当 runbook」をたどれる。索引に共通初動 8 ステップのチェックリストがある。
- [ ] AC-02: (1) シークレット / 鍵漏洩、(2) アカウント乗っ取り（管理者 / ユーザー）、(3) クラウド課金異常、(4) 個人データ漏洩（IP / メール / 位置情報 / 写真・音声）＋個人情報保護委員会報告、(5) サービス障害の **5 種の runbook がそれぞれ独立して存在**する。
- [ ] AC-03: 各 runbook に **(a) 初動順序、(b) 連絡先 / エスカレーション先、(c) 判断基準、(d) 終了条件**の 4 項目が揃っている。
- [ ] AC-04: シークレット漏洩 runbook が「**まず失効 / ローテーション → 次に履歴削除**」「push / 送信した秘密は漏洩済みとみなす」を明記し、対象シークレットを列挙している（**値は含まない**）。既存 `gemini-key-rotation.md` への相互参照がある。
- [ ] AC-05: アカウント乗っ取り runbook が「パスワード変更 → 全セッションからログアウト → MFA 再設定 → 連携 OAuth 見直し → 使い回し先変更」の順序と、管理者アカウントの特別扱い（`audit_logs` / `admin_login_attempts` の確認）を含む。
- [ ] AC-06: 個人データ漏洩 runbook に、ザリダス保持データの漏洩区分一覧（メール / `reporter_ip` / 位置情報 / 写真・音声 / プロフィール）と、個人情報保護委員会への報告トリガ・期限の目安・本人通知の節があり、数値・閾値に「2026 年時点の最新を要確認」と明示されている。
- [ ] AC-07: 証拠保全の共通節があり、「緊急時ほど削除を急ぐと証拠を失う」原則と、ザリダス固有の保全対象（`audit_logs` / `ai_call_logs` / `admin_login_attempts` / Sentry / 各社請求・監査ログ / GitHub Secret scanning）の列挙がある。`writeAuditLog` の fire-and-forget による欠落可能性への注意が記載されている。
- [ ] AC-08: 連絡先 / 相談窓口一覧（各社サポート + 公的窓口）が URL + 確認日つきで 1 か所にある。
- [ ] AC-09: Obsidian `Security_Research`（`07/23/27/13` 等）との二層リンク運用が README に明記され、各 runbook から該当 Obsidian ノートが参照されている（Obsidian ファイル自体は未変更）。
- [ ] AC-10: REQ-217（バックアップ / 復元）・REQ-218（課金ガードレール）・REQ-210（secret scanning ＝漏洩の予防）との相互参照が runbook 内に存在する。
- [ ] AC-11: 本 REQ の変更がドキュメントのみで、アプリ本体・スキーマ・CI に差分が無い。

## 影響範囲

- `docs/runbooks/`（新規。例 `docs/runbooks/incident/` 配下に索引 README + 共通初動 / 証拠保全 / 連絡先 + 5 種の runbook）
- 既存 `docs/runbooks/gemini-key-rotation.md`・`ai-model-rollback.md`（相互参照リンクの追記のみ。手順本体は不変）
- `docs/requirements/`（本 REQ-220。および REQ-217 / REQ-218 / REQ-210 からの相互参照）
- Obsidian `02_notes/Security_Research/`（**読み取り専用の下敷き**。`07_Incident_Response` / `23_Leak_Response_Playbook` / `27_Evidence_Preservation_Playbook` / `13_Monitoring_Logging` 等を参照するのみで、変更しない）
- アプリ本体（`src/`）・Supabase スキーマ（`supabase/`）・CI（`.github/`）には**影響なし**（ドキュメント整備のみ）

## 優先度

- **緊急度**: Medium / **重要度**: High
- **理由**: ザリダスは PII（メール・IP・位置情報・写真 / 音声・プロフィール）を保持しながら、**インシデント初動 runbook がプロジェクト内に 1 件も無い**（`docs/runbooks/` は平時運用手順のみ、`docs/requirements/` にも該当主題が不在）。漏洩や乗っ取りは「いつか起こる」前提で、起きた瞬間に一人で正しい順序（先に証拠保全 → 失効 / 封じ込め）を踏めるかが被害の大きさと法令対応（個人情報保護委員会報告）の成否を分ける。一方で本 REQ はコード変更を伴わないドキュメント整備であり、Obsidian に汎用知見の下敷き（`07/23/27/13`）が既にあるため、**低コストで PF のインシデント耐性を底上げできる費用対効果の高い整備**である。実害が発生してからでは間に合わない性質のため、平時に用意しておく価値が高い。
