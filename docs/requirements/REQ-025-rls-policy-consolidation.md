# REQ-025: RLSポリシーの整理・統合

## 背景
`supabase/schema.sql` 内でRLSポリシーが段階的に追加・置換されてきたが、旧ポリシーの削除と新ポリシーの作成が同一トランザクション内で行われていないケースがあり、マイグレーション失敗時に意図しないポリシーが共存するリスクがある。

## 現状の問題
- `supabase/schema.sql:121-122`: 旧 `public_read` / `public_insert` ポリシー（全公開）
- `supabase/schema.sql:484-496`: 新 `moderated_read` / `auth_insert` ポリシー（承認済みのみ表示、認証必須投稿）
- 旧ポリシーの DROP が新ポリシー作成の直前にあるが、`DO $$ BEGIN ... END $$` ブロック内で条件付き作成のため、部分的な実行失敗時に両方が共存する可能性
- `comments` テーブルに管理者用UPDATE/DELETEポリシーがない（オーナー削除のみ: 276行）
- `reporter_ip` カラムのアクセス制御が不明確（APIレスポンスに含まれる可能性）

## 目的
RLSポリシーを整理・統合し、意図したアクセス制御が確実に適用される状態にする。

## 要件

### 機能要件
- [ ] FR-025-01: `posts` テーブルの旧ポリシー（`public_read`, `public_insert`）を明示的にDROPし、新ポリシー（`moderated_read`, `auth_insert`）のみが存在する状態にする
- [ ] FR-025-02: `comments` テーブルに管理者用DELETEポリシーを追加する
- [ ] FR-025-03: `reporter_ip` カラムをSELECTポリシーから除外し、APIレスポンスに含まれないようにする（管理者のみアクセス可能）
- [ ] FR-025-04: 全テーブルのRLSポリシーを一覧化し、意図したアクセスモデルと一致することを検証するSQLスクリプトを作成する

### 非機能要件
- [ ] NFR-025-01: ポリシー変更はトランザクション内で実行し、部分適用を防ぐ
- [ ] NFR-025-02: 変更後にanonymous/authenticated/admin各ロールでのアクセステストを実施する

## 受入条件
- [ ] AC-01: `SELECT policyname FROM pg_policies WHERE tablename='posts'` に `public_read`, `public_insert` が含まれない
- [ ] AC-02: 匿名ユーザーが `status != 'approved'` の投稿を取得できない
- [ ] AC-03: 認証済みユーザーのみ投稿を作成できる
- [ ] AC-04: 管理者がコメントを削除できる
- [ ] AC-05: 一般ユーザーのAPIレスポンスに `reporter_ip` が含まれない

## 影響範囲
- `supabase/schema.sql`
- Supabase ダッシュボード（ポリシー確認）
- APIレスポンスのフィールド構成

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: RLSはSupabaseのセキュリティの根幹。ポリシーの不整合は未承認データの公開や不正アクセスに直結する
