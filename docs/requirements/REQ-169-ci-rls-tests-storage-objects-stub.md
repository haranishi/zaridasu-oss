# REQ-169: CI rls-tests で storage.objects 未スタブにより rls_storage が全 fail

## 背景
CI `rls-tests` ジョブ（`.github/workflows/ci.yml`）は plain な `postgres:16` に対し、Supabase が提供する一部スキーマを
スタブして `schema.sql` を適用し pg-tap を走らせる。現状 `auth` スキーマと `auth.users`、`auth.uid()` / `auth.jwt()` は
スタブされている（`ci.yml:194-197` 付近）が、**`storage` スキーマと `storage.objects` テーブルはスタブされていない**。

一方 `supabase/tests/rls_storage.sql`（REQ-135: post-photos/post-audio の uid フォルダ owner 制限の検証）は
`storage.objects` への INSERT ポリシーを検証するため、当該テーブルの存在を前提にしている。

## 現状の問題
- `supabase/tests/rls_storage.sql` の12サブテスト（INV-01〜INV-12）がすべて
  `42P01: relation "storage.objects" does not exist` で失敗する。
- 原因: CI には `storage.objects` が存在せず、`storage` ポリシー（migration `20260513000007_storage_owner_folder_upload.sql` /
  REQ-135 の `authenticated_upload` 等）も schema.sql 経由では適用されないため、テストの前提が成立しない。
- 補足: storage RLS ポリシー（`authenticated_upload` / `authenticated_upload_audio`）は Supabase の `storage.objects` 上に
  定義されるものであり、`schema.sql` にはミラーされていない（migration のみ）。CI で検証するには
  storage.objects スタブ＋ポリシー適用の両方が必要。
- 結果 CI `rls-tests` ジョブが赤（rls_storage.sql 12/12 fail）。

### 再現
```
# CI と同様に auth のみ stub して schema.sql 適用後:
pg_prove --ext .sql supabase/tests/rls_storage.sql
# => 42P01: relation "storage.objects" does not exist （12/12 fail）
```

## 目的
CI `rls-tests` ジョブで `storage.objects` を `auth.users` と同様にスタブし、検証対象の storage RLS ポリシーを
テスト環境に適用することで、`rls_storage.sql` を CI 上で実行可能にする。

## 要件
### 機能要件
- [ ] FR-169-01: `.github/workflows/ci.yml` の `rls-tests` ジョブ（および必要なら `schema-drift` ジョブ）で、
  `CREATE SCHEMA IF NOT EXISTS storage;` と Supabase 実態に近い最小限の `storage.objects` スタブテーブル
  （少なくとも `id`, `bucket_id`, `name`, `owner`, `metadata` 等 rls_storage.sql が参照する列）を作成する。
- [ ] FR-169-02: `storage.foldername(name)` / `storage.extension(name)` など rls_storage.sql / ポリシーが用いる
  storage スキーマ関数もスタブする（Supabase の実装相当の最小関数）。
- [ ] FR-169-03: 検証対象の storage RLS ポリシー（`authenticated_upload` / `authenticated_upload_audio`、REQ-135）を
  CI のテスト前提として適用する手段を用意する（専用 fixture SQL を rls_storage.sql 内 or ジョブ手順で適用、
  もしくは storage ポリシー定義を CI 適用可能な fixture に切り出す）。
- [ ] FR-169-04: スタブは「テスト実行のための最小構成」とし、本番の Supabase storage 実装を再現しすぎないこと
  （auth.users スタブと同程度の粒度）。

### 非機能要件
- [ ] NFR-169-01: 本変更は CI/テスト基盤の整備であり、アプリ本体・本番スキーマには影響しないこと。
- [ ] NFR-169-02: スタブが Supabase 実態と乖離してテストが「通るが本番で守れない」状態にならないよう、ポリシー本文
  （uid フォルダ制限・拡張子制限）は実 migration と同一定義を用いること。

## 受入条件
- [ ] AC-01: CI `rls-tests` ジョブで `rls_storage.sql` の INV-01〜INV-12 が実行され全通過する（owner 違反・拡張子違反が
  期待通り RLS で拒否される）。
- [ ] AC-02: storage スタブ追加により他テスト（rls_posts / rls_reports / rls_audit_logs / extract_request_ip）が退行しない。
- [ ] AC-03: CI `rls-tests` ジョブがグリーンになる（REQ-168 とあわせて）。

## 影響範囲
- `.github/workflows/ci.yml`（`rls-tests` ジョブのスタブ作成手順）
- `supabase/tests/rls_storage.sql`（前提 fixture の追加が必要な場合）
- storage ポリシー定義の fixture 化（必要な場合）
- migration `20260513000007_storage_owner_folder_upload.sql` / REQ-135（参照のみ）

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: storage の owner/拡張子制限は「他人フォルダへの書き込み」を防ぐ重要な防御線（REQ-135）であり、その回帰を
  検出する rls_storage.sql が CI で一切実行できていない。CI を赤にしていることに加え、セキュリティ検証の空白を生んでいる。
