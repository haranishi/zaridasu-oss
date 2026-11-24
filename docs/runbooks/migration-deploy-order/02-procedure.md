## 手順

### 1. 何が未適用か確認する

```bash
cd /path/to/zaridasu
SUPABASE_PROJECT_REF=edxmkqmjzbarjdgnkcvc \
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d) \
MODE=pr bash scripts/check-migration-drift.sh
```

`migration <version> はリポジトリにありますが本番未適用です` と出た版が対象。

### 2. 適用前に中身を読む

```bash
cat supabase/migrations/<version>_*.sql
```

- **冪等か**（`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS`）を確認する。
  このリポジトリの migration は再適用しても壊れない前提で書かれている。
- **破壊的操作（`DROP TABLE` / `DROP COLUMN` / データ削除）が無いか**を必ず目視する。
  ある場合は先に `docs/runbooks/backup-restore.md` でバックアップを取る。

### 3. 適用する

```bash
npx supabase db push --project-ref edxmkqmjzbarjdgnkcvc
```

パスワードを聞かれる。Supabase Dashboard → Project Settings → Database の接続情報を使う。

### 4. 適用結果を確認する

```bash
MODE=main bash scripts/check-migration-drift.sh   # 環境変数は手順 1 と同じ
```

`OK: 本番未適用の migration はありません` と `OK: 本番にのみ存在する migration はありません` の
両方が出れば完了。この状態で main へマージすれば `deploy` が走る。

### 5. 索引を更新する

`supabase/migrations/README.md` の本数表記と一覧行を更新する。
**CI がこの本数を検証している**（REQ-286 FR-286-05）ので、忘れると `migration-gate` が赤いままになる。

---
