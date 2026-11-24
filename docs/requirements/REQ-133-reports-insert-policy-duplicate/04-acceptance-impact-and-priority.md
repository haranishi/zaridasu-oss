## 受入条件

- [ ] **AC-133-01**: **Given** 本 migration を本番に適用済み、**When** `SELECT policyname, with_check FROM pg_policies WHERE tablename='reports' AND cmd='INSERT'`、**Then** 1 行のみ返り `policyname='validated_insert_reports'`、`with_check` は `post_id IS NOT NULL AND reason IN (...)` を含む。
- [ ] **AC-133-02**: **Given** anon クライアント、**When** `reason=NULL` で INSERT、**Then** `new row violates row-level security policy` でリジェクト。
- [ ] **AC-133-03**: **Given** anon クライアント、**When** `comment` に 1000 文字を渡して INSERT、**Then** `reports_comment_length` CHECK 制約違反でリジェクト。
- [ ] **AC-133-04**: **Given** 既存の正規 ReportButton フロー、**When** ユーザーが「不適切」で通報、**Then** 従来通り 1 件 INSERT され `flag_post_on_reports` トリガーも従来通り動く。
- [ ] **AC-133-05**: **Given** 同じ post_id に対する未解決 reports が 3 件、**When** 3 件目が INSERT される、**Then** トリガーで `posts.is_flagged=TRUE` がセットされる（既存挙動が壊れない）。
- [ ] **AC-133-06**: **Given** pg-tap テスト `rls_reports.sql`、**When** `supabase test db`、**Then** 全テストが pass。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260513000005_fix_reports_insert_policy.sql` | 新規。重複 policy DROP + validated_insert_reports 再作成 + comment 長さ CHECK |
| `supabase/schema.sql` | L234 の `public_insert_reports` を `validated_insert_reports` に置換、CHECK 制約追加 |
| `supabase/tests/rls_reports.sql` | 新規。pg-tap 5 ケース |
| `.github/workflows/*.yml`（該当する DB test job） | 既存の `supabase test db` ステップで自動拾われるなら変更不要 |

### 他機能への影響

- フロント `UnifiedReportButton` / 通報モーダル: 既に `reason` 必須・500 文字制限済みなので影響なし
- `flag_post_on_reports` トリガー: 変更なし。既存ロジックは維持
- REQ-020 / REQ-034 / REQ-025: 互いに独立、衝突なし

## 優先度

- **緊急度**: **Critical**
- **重要度**: **Critical**
- **理由**: anon が任意の post に対して無制限通報を打ち込めると、3 件で `is_flagged=TRUE` が立つため任意投稿の no-show 化攻撃が成立する（実害大）。修正は migration 1 本（10 行程度）+ pg-tap 1 ファイルで完結するため、コスト対効果が極めて高い。本番には既に `validated_insert_reports` が存在するため、本 migration は drift を schema 管理下に取り込む意味でも必須。
