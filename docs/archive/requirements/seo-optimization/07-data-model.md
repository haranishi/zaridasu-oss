## データモデル・DB設計

### 既存テーブル変更

#### テーブル: posts（変更）
| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|------|------|-----------|------|
| municipality | text | YES | NULL | 市区町村名（既存 or 新規追加） |

**追加インデックス:**
```sql
CREATE INDEX IF NOT EXISTS idx_posts_municipality ON posts(municipality) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_posts_species_municipality ON posts(species, municipality) WHERE status = 'approved';
```

### 新規テーブル

#### テーブル: municipalities（新規）
| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|------|------|-----------|------|
| id | text | NO | - | 市区町村コード（主キー） |
| name | text | NO | - | 市区町村名 |
| slug | text | NO | - | URLスラッグ (例: akita-shi) |
| lat | float8 | NO | - | 中心緯度 |
| lng | float8 | NO | - | 中心経度 |
| post_count | int4 | NO | 0 | 投稿数（キャッシュ） |
| updated_at | timestamptz | NO | now() | 更新日時 |

**インデックス:**
```sql
CREATE UNIQUE INDEX idx_municipalities_slug ON municipalities(slug);
```

**RLSポリシー:**
- SELECT: 全ユーザー許可
- INSERT/UPDATE/DELETE: 管理者のみ

---
