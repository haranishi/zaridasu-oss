## (k) 運用チェックリスト

### 初回セットアップ（実装着手時 / 人手）

- [ ] 現プラン（無料 / Pro）を確認し §0 に追記
- [ ] age（or gpg）鍵ペアを生成し、**公開鍵を Secret に / 秘密鍵をローカル厳重保管**（§a）
- [ ] GitHub Secrets を投入（`SUPABASE_DB_URL` / Storage S3 キー / `BACKUP_AGE_RECIPIENTS` ほか・§a）
- [ ] `backup.yml` を `workflow_dispatch` で手動起動し、暗号化 Artifacts が生成されることを確認（AC-01）
- [ ] 生成物に**平文ダンプが無い**ことを確認（Verify ステップ + 目視・AC-01）
- [ ] **リストア訓練 #2（フル）を実施し §(g) に記録**、RTO を §(h) と照合（AC-05）
- [ ] （任意）オフサイト R2/B2 を用意し `BACKUP_OFFSITE_*` を投入（コピー3・AC-03）
- [ ] （任意）月次オフライン世代の保管ルールを決める（コピー -1・AC-03）

### 月次（人手 / -1-0 への接近）

- [ ] 最新の暗号化世代を**手元 HDD or オブジェクトロック付きバケット**へ退避（オフライン / イミュータブル）
- [ ] リストア訓練を 1 回（少なくとも DRY_RUN 復号 + 整合チェック）回し §(g) に追記

### 可観測性（NFR-217-05 / AC-07）

- [ ] `backup.yml` が失敗したら通知が届く経路を確認（GitHub の Actions 失敗通知メール / Watch 設定。
      意図的に Secret を空にして失敗させ、通知 / 失敗ステータスが届くことを 1 回検証する）
- [ ] 「数週間気づかず落ちていた」を防ぐため、週次で直近 run の成否を目視（KPI レビュー時に併せて確認）

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| ジョブが即 skip（`::notice ... 未設定`）| 対応する Secret 未投入。Preflight ステップの "MISSING" を確認して §(a) の表に従い投入 |
| `暗号化できません ... exit 1` | `BACKUP_AGE_RECIPIENTS` も `BACKUP_GPG_RECIPIENTS` も空。最低一方を設定（§a）|
| `pg_dump: server version mismatch` | runner の `postgresql-client` 版が古い。`backup.yml` の client 導入を新しめの版に固定するか `supabase db dump` 経路に倒す |
| Storage が 0 件 | S3 Connection キー未発行 / リージョン不一致 / エンドポイント誤り。`SUPABASE_STORAGE_S3_*` を確認 |
| 復号で `no identity matched` (age) | `AGE_IDENTITY_FILE` が暗号化時の公開鍵に対応する秘密鍵でない。正しい鍵を指す |
| リストア後に写真がリンク切れ | Storage 未投入（§d）or 新 ref への URL 補正漏れ（§e-2）|
| `psql: ... ON_ERROR_STOP` で停止 | スキーマ未適用のままデータ投入した可能性。先に §(f) を実施 |

---

## 関連

- 要件定義: [REQ-217](../requirements/REQ-217-backup-bcp.md)
- 関連 runbook:
  - [Supabase Edge Function デプロイ](./edge-function-deploy.md)（project ref / CLI 前提）
  - インシデント / 漏洩対応（REQ-220）— 本書は「復旧能力」、インシデント対応は別 runbook
- 対象ファイル:
  - `.github/workflows/backup.yml`
  - `scripts/backup-db.sh` / `scripts/backup-storage.sh`
  - `scripts/restore-db.sh` / `scripts/restore-storage.sh`
  - `supabase/schema.sql`（バケット / RLS / トリガー定義）
  - `supabase/migrations/20260513000007_storage_owner_folder_upload.sql`（Storage ポリシー）
