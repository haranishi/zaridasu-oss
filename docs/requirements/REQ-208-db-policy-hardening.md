# REQ-208: DB 防御の小整備（survey_requests 列保護トリガー追加・トリガー族の JWT 無し挙動の統一）

## 背景
ザリダス (Supabase / PostgreSQL) は posts に対し RLS ポリシーに加えて BEFORE UPDATE/INSERT の「列固定トリガー」（`protect_post_status` / `protect_official_flag` 等）を重ね、所有者でも管理系カラムを改竄できないよう多層防御している。一方、後発の `survey_requests`（調査依頼）には同等の列保護トリガーが無く、所有者がトリガー維持の集計値やステータスを直接書き換えられる。また、is_official 保護トリガー族のうち新しい migration が「JWT 無しセッション」の扱いを兄弟関数とそろえておらず、トリガー族統一という当初目的が部分達成にとどまっている。

いずれも実害（外部からの権限昇格）は限定的だが、防御設計の一貫性に関わる小整備であり、`supabase/migrations/` と `supabase/tests/` の現状を確認した上で 2 課題を 1 つの REQ にまとめる。

> 実装時の注意: 既存 pgTAP テストは `supabase/tests/rls_posts.sql`・`rls_reports.sql`・`rls_audit_logs.sql`・`rls_storage.sql`・`extract_request_ip.sql` で、`survey_requests` 専用テストは**存在しない**（`grep` 確認）。posts のトリガーテスト（`rls_posts.sql` の INV-R136-* / service_role バイパス）の書式を踏襲してテストを追加すること。

## 現状の問題
（ファイルパス:行番号つき）

### 1. survey_requests の owner UPDATE に列保護が無く、集計値・ステータスを任意改竄できる
- `supabase/schema.sql:1209` の owner 更新ポリシーは
  ```sql
  CREATE POLICY "survey_requests_owner_update" ON survey_requests FOR UPDATE USING (auth.uid() = user_id);
  ```
  で**行レベルの所有者判定のみ**。posts の `protect_post_status` 相当の BEFORE UPDATE 列固定トリガーが survey_requests には**無い**。
- `survey_requests` テーブル定義（`schema.sql:1187-1200`）には `response_count INTEGER NOT NULL DEFAULT 0`（:1198）・`status`（:1197）・`closed_at`（:1199）がある。
- このうち `response_count` は**トリガーで維持される集計キャッシュ**で、`supabase/migrations/20260425000003_survey_request_responses.sql:32-50` の `sync_survey_response_count()` が survey_responses の INSERT/DELETE で `+1 / GREATEST(-1,0)` 同期している。
- 列保護が無いため、依頼所有者は自分の依頼行に対し `UPDATE survey_requests SET response_count = 9999`（協力者数の水増し）や `status` / `closed_at` の任意変更を直接実行できる。影響は**自分の依頼カードの表示水増し等に限定**され、他ユーザーのデータや権限には及ばないが、集計キャッシュの整合性と「クローズ操作のみ所有者に許可」という想定が崩れる。

### 2. is_official 保護トリガー族で「JWT 無しセッション」の挙動が不揃い（migration 目的の部分達成）
- 新 migration `supabase/migrations/20260513000014_protect_official_flag_service_role_bypass.sql:17` の `protect_official_flag()` は、先頭で
  ```sql
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
  ```
  と service_role のみ素通りさせ、その後 INSERT 時は非 admin に `NEW.is_official := FALSE` を強制する（:20-25）。**JWT が無い（claims が NULL / 空）セッションでも非 admin 扱いで is_official=FALSE が強制**される。
- 兄弟関数 `protect_post_status()`（`supabase/migrations/20260513000008_*.sql:24-27`）は、
  ```sql
  jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  ...
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN RETURN NEW; END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
  ```
  と、**JWT 無し / 空 claims を素通り**させてから service_role を判定する（claims のパース失敗も `EXCEPTION ... RETURN NEW` で素通り）。
- つまり「JWT 無しセッション」で、`protect_post_status` は素通り、`protect_official_flag` は is_official=FALSE 強制、と分岐が食い違う。`protect_official_flag` 側が**より制限が強い**方向なので脆弱性ではないが、20260513000014 の migration が掲げた「トリガー族の挙動統一（rls_posts.sql INV-R136-07 で顕在化した不整合の解消）」という目的が部分的にしか達成されていない。

## 目的
- survey_requests にも posts と同設計の列保護を入れ、所有者には「クローズ操作」のみ許可し、集計値・他の管理系カラムの直接改竄を防ぐ。
- is_official 保護トリガー族の JWT 無し挙動を兄弟関数とそろえる（または意図的な差を明示する）ことで、トリガー族統一の目的を完遂しドキュメント化する。

## 要件
### 機能要件
- [ ] FR-208-01: `survey_requests` に BEFORE UPDATE の列固定トリガー（例 `protect_survey_request_columns()`）を新規 migration で追加する。posts の `protect_post_status` と同様に、service_role・admin は素通り、一般の所有者に対しては **`response_count`・`user_id`・`created_at` 等を OLD 固定**し、**クローズ操作（`status` を `'closed'` にする / `closed_at` を設定する）のみ許可**する形にする。`response_count` は集計トリガー（`sync_survey_response_count`）が唯一の更新者になるよう保護する。
- [ ] FR-208-02: FR-208-01 の挙動を検証する pgTAP テストを `supabase/tests/`（例 `rls_survey_requests.sql`）に追加する。最低限、(a) 所有者が `response_count` を直接 UPDATE しても OLD 値が維持される、(b) 所有者は `status='closed'`/`closed_at` のクローズ更新はできる、(c) service_role / admin は従来どおり更新できる、(d) 他人の依頼は更新できない（既存 RLS）を Given/When/Then で確認する。`rls_posts.sql` の `_set_jwt` 等のヘルパー書式を踏襲する。
- [ ] FR-208-03: `protect_official_flag()`（`20260513000014`）の JWT 無し挙動を兄弟関数 `protect_post_status` とそろえる。いずれかを選んで実施する：
  - (a) **統一案（推奨）**: `protect_official_flag` の先頭に `jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb; IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN RETURN NEW; END IF;` 相当の素通り分岐（claims パース失敗の EXCEPTION ハンドリング含む）を追加し、`protect_post_status` と同じ判定順にする。
  - (b) **意図的除外案**: 統一しない方針なら、`protect_official_flag` 内に「JWT 無しでも is_official を FALSE 強制する意図」をコメントで明記し、兄弟関数との差が設計判断であることを残す。
- [ ] FR-208-04: FR-208-03(a) を採る場合、`protect_official_flag` の JWT 無し挙動変更を `supabase/tests/rls_posts.sql`（is_official 系 INV）に回帰テストとして反映 / 追加し、posts のトリガー族で JWT 無し挙動が一致することを確認する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-208-01: 追加トリガー / 関数は posts 同様 `SECURITY DEFINER` + `SET search_path = public` とし、既存の RLS ポリシー・rate-limit トリガー（`enforce_survey_request_rate`、`schema.sql:1229-1232`）と共存すること。
- [ ] NFR-208-02: migration は冪等（`CREATE OR REPLACE FUNCTION` / `DROP TRIGGER IF EXISTS` → `CREATE TRIGGER`）で、既存環境への再適用で失敗しないこと。schema.sql 側の定義とも整合させること。
- [ ] NFR-208-03: `npm run schema:check`（schema/型同期チェック）が通ること。

## 受入条件
- [ ] AC-01: 所有者が `UPDATE survey_requests SET response_count = <任意値>` を実行しても `response_count` が OLD 値のまま変わらない（pgTAP で確認）。
- [ ] AC-02: 所有者は自分の依頼を `status='closed'` / `closed_at` 設定でクローズできる（pgTAP で確認）。
- [ ] AC-03: service_role / admin は survey_requests を従来どおり更新でき、他人の依頼は更新できない（既存 RLS の回帰なし）。
- [ ] AC-04: `protect_official_flag` の JWT 無しセッション挙動が `protect_post_status` と一致する（統一案）か、または差異の意図がコメントで明記されている（意図的除外案）。
- [ ] AC-05: 既存 pgTAP（`rls_posts.sql` ほか）と新規 `rls_survey_requests.sql` が全件パスし、CI（pg-tap）が成功する。

## 影響範囲
- `supabase/migrations/`（survey_requests 列保護トリガーの新規 migration、必要なら protect_official_flag の修正 migration）
- `supabase/schema.sql`（survey_requests のトリガー定義の追記・整合）
- `supabase/migrations/20260513000014_protect_official_flag_service_role_bypass.sql`（JWT 無し分岐 or コメント）
- `supabase/tests/`（`rls_survey_requests.sql` 新規、`rls_posts.sql` の is_official 回帰）

## 優先度
- **緊急度**: Low / **重要度**: Low〜Medium / **理由**: (1) は権限昇格や他者データ改竄ではなく自分の依頼の表示水増しに限定され、実害は小さい。(2) は制限が強い方向の不一致で脆弱性ではなく、ドキュメント / 設計一貫性の問題。ただし防御の多層化方針（posts と同等の列保護）と「集計キャッシュの単一更新者」を担保する意味で、コストの低い堅牢化として整理する価値がある。
