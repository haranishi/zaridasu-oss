## (b) 暗号化ダンプの復号

復号鍵は運用者ローカルのみ。CI では復号しない（リストアは人手の作業）。

```bash
# age の場合（DB ダンプの中身を確認だけする = DRY_RUN）
AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key DRY_RUN=1 \
  ./scripts/restore-db.sh ./backups/zaridasu-db-YYYYmmddTHHMMSSZ.sql.age

# gpg の場合（秘密鍵はキーリングから自動使用）
DRY_RUN=1 ./scripts/restore-db.sh ./backups/zaridasu-db-....sql.gpg
```

- 同名の `*.sha256` があれば**復号前に SHA-256 整合チェック**が走る（破損 / 改竄検知）。
- 復号後に `CREATE TABLE` / `COPY` / `INSERT` 等が含まれるか簡易サニティチェックする。
- `DRY_RUN=1` は復号して先頭 20 行を表示するだけで DB には触れない（訓練・確認用）。
- Storage アーカイブも同様: `DRY_RUN=1 ./scripts/restore-storage.sh ....tar.gz.age`。

> GitHub Artifacts からの取得は Actions UI の該当 run → Artifacts、または `gh run download <run-id>`。

---

## (c) DB リストア手順（新規 / 既存 Supabase プロジェクト）

> リストア先は **新規プロジェクト**（本番が死んだ / 乗っ取られた場合）か、**ローカル `supabase start`**
> （訓練 / 部分復旧の検証）を推奨。**本番への直リストアは最終手段**（誤操作で二次被害が出やすい）。

### C-1. リストア先 DB を用意

- **新規 Supabase プロジェクト**: Dashboard で作成 → Connection string を控える。
- **ローカル**: `supabase start`（接続先は `postgres://postgres:postgres@127.0.0.1:54322/postgres`）。

### C-2. スキーマ / RLS / トリガー / バケットポリシーを先に再構築（→ §(f)）

論理ダンプには通常テーブル定義も含むが、**RLS ポリシー・トリガー・バケット・Storage ポリシーの
取りこぼしを防ぐため、先に migration / schema.sql を適用**しておくのが安全（§(f) 参照）。

### C-3. データを流し込む

```bash
AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key \
TARGET_DB_URL="postgres://...:6543/postgres" \
  ./scripts/restore-db.sh ./backups/zaridasu-db-....sql.age
```

- `psql --set ON_ERROR_STOP=1` で流すため、途中エラーで停止する（壊れたまま続行しない）。
- 既存データと衝突する場合は、リストア先を**まっさらにしてから**流す（部分復旧時は対象テーブルのみ
  抽出して流すなど、シナリオに応じて手動調整）。

---
