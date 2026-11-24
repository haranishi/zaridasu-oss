## (f) RLS / トリガー / バケットポリシーの再構築

論理ダンプはデータ中心。**RLS・トリガー・関数・バケット・Storage ポリシーはリポジトリの
スキーマ定義を真実として再適用**する（取りこぼしと定義ドリフトを同時に防ぐ）。

### 新規プロジェクト / ローカルでの適用

```bash
# A. schema.sql を一括適用（CI の rls-tests / schema-drift と同じ流儀）
psql "$TARGET_DB_URL" -f supabase/schema.sql

# B. もしくは Supabase CLI で migration を順に適用
supabase db push --db-url "$TARGET_DB_URL"
```

これにより以下が再構築される:

- 各テーブルの **RLS ポリシー**（`supabase/schema.sql` / `supabase/migrations/2026*_*.sql`）
- **トリガー / 関数**（監査ログ append-only、投稿ステータス保護、レート制限等）
- **Storage バケット**（`post-photos` `:425-`, `post-audio` `:1530-`）と **Storage ポリシー**
  （`authenticated_upload` の uid フォルダ制約等。`migrations/20260513000007_storage_owner_folder_upload.sql`）

> 適用順序の注意: CI（`ci.yml` の `rls-tests`）は既知の migration 順序バグを避けるため
> **`schema.sql` を直接適用**している。リストアでも**まず `schema.sql`**を使うのが最も確実。
> その後で `schema.sql` に含まれない新しい migration があれば個別に当てる。

---

## (g) リストア訓練 記録（FR-217-06 / AC-05）

> **AC（受入条件）**: 実装時に**最低 1 回**、本手順で検証 / ローカル環境へ実際に復元し、
> アプリ起動 + データ表示 + 画像 / 音声参照まで通ることを確認し、下表に記録する。
> 訓練でつまずいた点は手順書本体に反映する（フィードバックループ）。

### 訓練記録テンプレ（コピーして追記）

```
### 訓練 #N — YYYY-MM-DD
- 実施者:
- リストア先: [ ] ローカル supabase start / [ ] 検証用新規プロジェクト
- 使用バックアップ: zaridasu-db-........age / zaridasu-storage-........tar.gz.age
- 所要時間（RTO 実測）: __ 分（復号→DB→Storage→整合チェック完了まで）
- 結果: [ ] 成功 / [ ] 一部失敗
- 整合チェック §(e): [ ] テーブル件数一致 [ ] Storage 件数一致 [ ] 写真200 [ ] 音声200 [ ] /admin 表示
- つまずき / 手順書への反映:
- RTO 目標(§h NFR-217-03)との比較:
```

### 訓練記録

#### 訓練 #1 — 2026-06-16（暗号化ラウンドトリップの実証 / 自動）

- 実施者: REQ-217 実装（CI 環境外のローカル smoke test）
- 範囲: **暗号化バックアップ → 平文破棄 → 整合チェック → 復号**の経路を実データ形状のダミーダンプで実証
  （本番 DB / Storage への接続は伴わない部分訓練。フル訓練は下記「未実施」を参照）。
- 手順: `pg_dump` 相当の出力（`CREATE TABLE posts ...` / `INSERT ...`）を `scripts/backup-db.sh` の
  gpg 経路で暗号化 → `backups/` に平文 `.sql` が残らないことを確認 → `.sha256` 整合チェック合格 →
  `scripts/restore-db.sh`（`DRY_RUN=1`）で復号し原文一致を確認。
- 結果: **成功**。
  - 暗号化出力 `*.sql.gpg` + `*.sql.gpg.sha256` のみが残り、平文 `*.sql` は破棄されていた（NFR-217-01 / AC-01 の安全網が機能）。
  - SHA-256 整合チェック `OK`。
  - gpg 復号で原文（3 行）を完全復元。`DRY_RUN=1` ガードにより DB へは書き込まれないことも確認。
- つまずき: なし（`bash -n` 構文チェックも 4 スクリプト全て pass）。
- 備考: **これは暗号化/復号と平文破棄の実証であり、本番からの実ダンプ・実 Storage を用いた
  エンドツーエンド訓練（下記）は別途必須**。

#### 未実施（実装着手時に運用者が必ず実施し、ここに #2 として追記する）

- [ ] **フル訓練**: 本番から実際に取得した `*.age` で、ローカル `supabase start` もしくは検証用新規
      プロジェクトへ DB + Storage を復元し、§(e) の整合チェックを全項目クリアする。
- [ ] **RTO 実測**を記録し §(h) の NFR-217-03 と照合する。
- [ ] つまずいた点を本 runbook に反映する。

---
