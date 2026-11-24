# REQ-034: posts テーブルの非管理列を RLS トリガーで保護

## 背景
`posts` テーブルの RLS は、`authenticated` ロールによる INSERT を `auth.uid() = user_id` のみでチェックしている。また UPDATE 時の管理項目保護は `protect_post_status` トリガーで status 系 5 列のみに限定されている。一方で、posts テーブルには管理者／サービスロール専用の列（`is_official` / `is_flagged` / `reporter_ip` / `ai_result` / `ai_analyzed_at`）が存在し、これらは一般ユーザーから書き換え不可であるべきだが、現状は WITH CHECK にも BEFORE トリガーにも制約がない。

## 現状の問題
- `supabase/schema.sql:491-496` 匿名投稿廃止ポリシー。WITH CHECK は `auth.uid() = user_id` のみ。

  ```sql
  -- 8-4. 匿名投稿を廃止: 認証ユーザーのみINSERT可
  DROP POLICY IF EXISTS "public_insert" ON posts;
  DO $$ BEGIN
    CREATE POLICY "auth_insert" ON posts FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ```

- `supabase/schema.sql:539-569` 現在の `protect_post_status` は status / rejection / reviewed / auto_approved のみ保護しており、`is_official` / `is_flagged` / `reporter_ip` / `ai_result` / `ai_analyzed_at` は一般ユーザー UPDATE でも素通りする。

  ```sql
  -- 一般ユーザーは status 系カラムを変更不可
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status            := OLD.status;
    NEW.rejection_reason  := OLD.rejection_reason;
    NEW.rejection_message := OLD.rejection_message;
    NEW.reviewed_at       := OLD.reviewed_at;
    NEW.reviewed_by       := OLD.reviewed_by;
    NEW.auto_approved     := OLD.auto_approved;
  END IF;
  ```

- INSERT 時には `protect_post_status` が効かない（UPDATE トリガーのみ）ため、`owner_update` ポリシー経由で自分の投稿に `is_official=true` を立て、承認後に「公式バッジ」として扱われるリスクがある。

## 目的
- 管理者／`service_role` 以外のユーザーが、管理系列（`is_official` / `is_flagged` / `reporter_ip` / `ai_result` / `ai_analyzed_at`）を書き込み／更新できないようにし、RLS バイパスを防ぐ。
- Edge Function（`service_role`）と admin ユーザーは従来通り更新可能とする。

## 要件

### 機能要件
- [ ] FR-034-01: `protect_post_status` トリガー関数を拡張し、非 admin / 非 service_role のとき以下 5 列の UPDATE を禁止（`NEW.x := OLD.x`）する。
  - `is_official` / `is_flagged` / `reporter_ip` / `ai_result` / `ai_analyzed_at`
- [ ] FR-034-02: `posts` に BEFORE INSERT トリガー（例: `protect_post_admin_columns_insert`）を追加し、非 admin / 非 service_role のとき上記 5 列を強制的にデフォルト値（`is_official=false` / `is_flagged=false` / `reporter_ip=NULL` / `ai_result=NULL` / `ai_analyzed_at=NULL`）で上書きする。
- [ ] FR-034-03: `service_role` および `app_metadata.role = 'admin'` の JWT では従来通りすべての列を書き込めること。Edge Function の自動承認フロー（`analyze-image` など）が壊れないこと。
- [ ] FR-034-04: スキーマ変更は冪等に（`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS ... CREATE TRIGGER`）適用できること。

### 非機能要件
- [ ] NFR-034-01: トリガー追加による INSERT/UPDATE の遅延増は 1ms 以内（単行ベース）。

## 受入条件
- [ ] AC-01: 認証ユーザーとして `INSERT INTO posts (..., is_official, is_flagged) VALUES (..., true, true)` した場合、行は作成されるが `is_official=false`, `is_flagged=false` になる。
- [ ] AC-02: 認証ユーザーとして自分の post を `UPDATE posts SET is_official=true, ai_result='{"x":1}'` した場合、これら 2 列は変わらない（OLD を維持）。
- [ ] AC-03: admin ロールおよび service_role では、上記 5 列を自由に更新・INSERT できる（既存承認フロー＝`analyze-image` 実行後の status=approved / auto_approved=true / ai_result 書込みが成功する）。
- [ ] AC-04: 既存の `protect_post_status` による status 保護が従来通り機能する（回帰なし）。
- [ ] AC-05: psql または Supabase SQL Editor で再適用しても重複エラーが出ない（冪等性）。

## 影響範囲
- 変更対象ファイル
  - `supabase/schema.sql`（`protect_post_status` 関数の拡張、INSERT 用トリガー追加）
  - 必要に応じて `supabase/migrations/` 下に新規マイグレーション SQL を追加

## 優先度
- **緊急度**: Critical
- **重要度**: Critical
- **理由**: 非管理者が `is_official` を立てた投稿を作成できる RLS バイパスは、公式情報の偽装につながるため即時対応が必要。

