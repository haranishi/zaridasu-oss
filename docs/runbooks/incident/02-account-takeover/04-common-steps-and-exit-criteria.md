## 詳細手順（共通）

### Step 1. 記録・保全
- [evidence-preservation.md](./evidence-preservation.md) の記録テンプレで開始。不審ログイン画面・通知メール・上記 SQL 結果を保全。

### Step 2. 封じ込め
- A（一般）/ B（管理者）の封じ込めを実施。**パスワード変更 → 全セッション失効 → MFA → 連携見直し → 使い回し先**の順を守る。

### Step 3. 影響範囲特定
- 乗っ取り中の操作・閲覧・改ざん・送信・課金を洗い出す。
- **個人データ閲覧 / 流出の可能性**が出たら [04-personal-data-breach.md](./04-personal-data-breach.md) を主 runbook に。
- **課金異常**が出たら [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md) を併用。

### Step 4. 復旧
- 不正な設定変更・連携・ロール付与を巻き戻す。
- データ改ざん / 削除があれば、`docs/runbooks/backup-restore.md`（REQ-217 で整備予定）での復元を検討（→ [05-service-outage.md](./05-service-outage.md) 経由）。

---

## 終了条件（「対応したつもり」で閉じない）

- [ ] 対象アカウントの**パスワード変更・全セッション失効・MFA 再設定・連携アプリ見直し**を完了した
- [ ] パスワード使い回しの他サービスも変更した
- [ ]（管理者）`audit_logs` / `admin_login_attempts` / データ実体を確認し、**不正に付与された admin ロールを剥奪**した
- [ ]（管理者）service-role など波及し得る秘密のローテーション要否を判断し、必要なら [01](./01-secret-leak.md) を実施した
- [ ] 乗っ取り中の操作・閲覧・改ざん・送信・課金の影響範囲を特定した
- [ ] 個人データ閲覧 / 流出があれば [04](./04-personal-data-breach.md)、課金被害があれば [03](./03-cloud-billing-anomaly.md) の終了条件も満たした
- [ ] 侵入経路（パスワード漏洩・フィッシング・MFA 不在・秘密漏洩）を特定し、再発防止（MFA 必須・強固なパスワード・連携棚卸し）を実施した
- [ ] 証拠を保全し、タイムラインを記録した

---

## 関連

- 索引・共通初動: [README.md](./README.md)
- 証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
- 秘密の波及: [01-secret-leak.md](./01-secret-leak.md)　|　課金の波及: [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md)　|　個人データの波及: [04-personal-data-breach.md](./04-personal-data-breach.md)
