# REQ-048: posts RLS／トリガー（列保護）の DB 直接テスト追加

これは何か: REQ-034 で追加した `posts` の RLS ポリシーと列保護トリガーを、pg-tap で DB 層から直接検証するテスト整備の要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

REQ-034 は `auth_insert` ポリシー・`protect_post_status` トリガー・`protect_post_insert_columns` トリガーという権限昇格防御を追加したが、これらは DB 層の実装であり**アプリ層のテスト（Vitest）からは実質的に到達できない**。`supabase/tests/` ディレクトリ自体が存在せず、CI にも Supabase ローカル起動ステップが無いため、DB 層のリグレッションは手動 QA 任せになっている。本要件は `supabase db test`（pg-tap）でこれらを直接検証し、将来のスキーマ変更（ポリシー DROP・トリガー改変・search_path 誤設定など）による権限昇格を回帰検知できるようにする。

## 主要な決定事項（要点）

- **守るべき不変条件は5つ**（INV-01〜05）。非 admin の INSERT は運用制御カラムが強制リセット、非 admin の UPDATE は OLD 値維持、admin は両方で任意設定可、**service_role は自動承認フローのため直接 UPDATE 可**、anon は INSERT 拒否。
- **テストは integration（DB-native / SQL）**。Supabase CLI の `supabase db test`（内部で pg-tap）を使い、配置先は `supabase/tests/rls_posts.sql`。
- **トランザクション分離**: 各ケースを `BEGIN;` で開始し終端で `ROLLBACK;`。ロール切替は `SET LOCAL request.jwt.claims` で JWT を発行する。
- **ネガティブ検証を受入条件に含める**（AC-02）。トリガーを一時 DROP すると TC-01/TC-07 が RED に、`auth_insert` を `TO public` にすると TC-06 が RED になることを確認する＝テストが本当に効いていることの証明。
- **`supabase/schema.sql` は変更しない**（検証対象そのもの）。新規ファイルとして本体・ヘルパー・フィクスチャの3つを追加し、CI に `supabase db test` ステップを足す。
- 緊急度 高 / 重要度 **Critical**。DB 層の変更はアプリテストから検知不能で、テスト不在のまま schema.sql を編集するリスクが継続している。

## 分割ファイル

- [01-background-and-invariants.md](REQ-048-test-rls-column-protection/01-background-and-invariants.md) — 背景（対象の3保護機構と該当行）／守りたい不変条件 INV-01〜05 ／現状の検出可否（既存テストでカバーできない4つの理由）／テスト種別と環境（フレームワーク・セットアップ手順・配置先）
- [02-test-cases-and-acceptance.md](REQ-048-test-rls-column-protection/02-test-cases-and-acceptance.md) — テストケース TC-01〜07（Given/When/Then と実 SQL）／カバレッジ目標（schema.sql の行範囲と到達分岐）／テストデータ・フィクスチャ／受入条件 AC-01〜03 ／影響範囲 ／優先度
