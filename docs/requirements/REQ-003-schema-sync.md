# REQ-003: schema.sql とマイグレーションファイルの乖離修正

## 背景
`supabase/schema.sql`（手動セットアップ用の統合スキーマ）と `supabase/migrations/20240101000000_initial_schema.sql`（マイグレーション用の統合スキーマ）の間で、カラム定義・インデックス・RPC関数に差異が生じている。新規環境でどちらを実行するかによって異なるスキーマが生成される。

## 現状の問題

### 1. posts テーブルのカラム欠落（schema.sql に存在しない）
マイグレーション `20240101000000_initial_schema.sql:77-83` には以下のカラムが定義されているが、`schema.sql` の posts テーブル定義（13-29行目）に含まれていない:

| カラム | マイグレーション | schema.sql |
|--------|:---:|:---:|
| `weather TEXT CHECK(...)` | 81行目に存在 | 欠落 |
| `temperature DECIMAL(4,1)` | 82行目に存在 | 欠落 |
| `humidity INTEGER CHECK(...)` | 83行目に存在 | 欠落 |
| `reporter_ip TEXT` | 78行目に存在 | 欠落 |
| `is_flagged BOOLEAN NOT NULL DEFAULT FALSE` | 79行目に存在 | 欠落 |

ただし `usePostForm.ts:219-220` ではフロントエンドが `weather`, `temperature`, `humidity` をINSERTしているため、`schema.sql` で環境構築した場合にINSERTが失敗する。

### 2. RPC 関数の欠落（schema.sql に存在しない）
マイグレーション `20240101000000_initial_schema.sql:483-494` に定義されている `get_audit_logs()` RPC関数が `schema.sql` に存在しない:
- `get_audit_logs(p_limit, p_offset, p_action, p_from, p_to, p_admin_id)` — 監査ログ取得関数
- `get_user_activity(p_user_id)` — ユーザー活動取得関数（同ファイル497行目付近）

これらは管理画面から呼び出されるため、`schema.sql` で環境構築した管理者はこれらの機能が使えない。

### 3. インデックスの欠落（schema.sql に存在しない）
マイグレーション `20240101000000_initial_schema.sql:109-111` に定義されているインデックスが `schema.sql` に存在しない:
- `idx_posts_reporter_ip_created` — reporter_ip + created_at
- `idx_posts_is_flagged` — is_flagged
- `idx_posts_weather` — weather

### 4. survey_request_id カラムのリファレンス
`schema.sql:675-678` には `survey_request_id` カラムが `ALTER TABLE` で追加されているが、マイグレーション版では posts テーブル定義に直接含まれていない場合がある（実行順序依存）。

## 目的
`schema.sql` を `migrations/20240101000000_initial_schema.sql` と同等の状態に同期し、どちらのファイルで環境構築しても同一のスキーマが生成されるようにする。

## 要件

### 機能要件
- [ ] FR-003-01: `schema.sql` の posts テーブル定義に `weather`, `temperature`, `humidity` カラムを追加する
- [ ] FR-003-02: `schema.sql` の posts テーブル定義に `reporter_ip`, `is_flagged` カラムを追加する
- [ ] FR-003-03: `schema.sql` に `get_audit_logs()` RPC関数を追加する
- [ ] FR-003-04: `schema.sql` に `get_user_activity()` RPC関数を追加する
- [ ] FR-003-05: `schema.sql` に欠落しているインデックス（`idx_posts_reporter_ip_created`, `idx_posts_is_flagged`, `idx_posts_weather`）を追加する
- [ ] FR-003-06: 今後の乖離を防ぐため、schema.sql のヘッダコメントに「マイグレーションとの同期が必要」旨の注意書きを追加する

### 非機能要件
- [ ] NFR-003-01: `schema.sql` は引き続き冪等（何度実行してもエラーにならない）設計を維持すること
- [ ] NFR-003-02: 既存環境で `schema.sql` を再実行した場合に既存データが破壊されないこと

## 受入条件
- [ ] AC-01: 新規のSupabase環境で `schema.sql` のみを実行し、`weather`, `temperature`, `humidity` カラムを含む投稿が正常に INSERT できること
- [ ] AC-02: 新規環境で `schema.sql` のみ実行後、`get_audit_logs()` RPC が管理者権限で正常に呼び出せること
- [ ] AC-03: 新規環境で `schema.sql` のみ実行後、`get_user_activity()` RPC が管理者権限で正常に呼び出せること
- [ ] AC-04: 既存環境で `schema.sql` を再実行してもエラーが発生しないこと
- [ ] AC-05: `schema.sql` と `migrations/20240101000000_initial_schema.sql` の posts テーブル定義が同等であること（diff で重大な差異がないこと）

## 影響範囲
- `supabase/schema.sql` — カラム・関数・インデックスの追加
- `supabase/migrations/` — 変更なし（マイグレーション側が正）

## 優先度
- **緊急度**: Medium
- **重要度**: Critical
- **理由**: `schema.sql` で新規環境を構築した場合、フロントエンドの投稿機能（weather/temperature/humidity の INSERT）が失敗し、管理画面の監査ログ機能が動作しない。開発者のオンボーディングや環境再構築時に障害が発生する。
