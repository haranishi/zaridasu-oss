### 非機能要件

- [ ] **NFR-136-01: 冪等性**
  `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS ... CREATE TRIGGER` で複数回実行可能。

- [ ] **NFR-136-02: パフォーマンス**
  単一 BEFORE UPDATE トリガー内のカラム代入のみ。20 列程度の代入で 1ms 未満（NFR-034-01 と同等）。

- [ ] **NFR-136-03: admin / service_role 後方互換**
  既存の admin による承認・却下、Edge Function (`analyze-image`/`analyze-audio`) による `ai_result` / `ai_analyzed_at` / `ai_failure_count` / `auto_approved` / `audio_hash` 書込み、`generate_survey_request_*` 系の `survey_request_id` 書込みがすべて従来通り成功。

### テスト要件

- [ ] **FR-136-05: pg-tap テスト拡張**
  `supabase/tests/rls_posts.sql` を拡張。一般ユーザーで UPDATE しても以下の列が OLD のまま維持されることを assert（各列 1 ケース）:
  - `user_id` → 他人 UUID 指定で UPDATE → policy で deny（既存検証）
  - `is_official`, `is_flagged`, `reporter_ip`, `ai_result`, `ai_analyzed_at`, `ai_failure_count`
  - `audio_hash`, `image_hashes`
  - `audio_url`, `audio_duration_ms`
  - `weather`, `temperature`, `humidity`
  - `survey_request_id`, `survey_duration_minutes`
  - `status`, `rejection_reason`, `rejection_message`, `reviewed_at`, `reviewed_by`, `auto_approved`
- [ ] **FR-136-06: admin 経路の回帰テスト**
  admin JWT で同じ列を UPDATE → 新値が反映されること（保護がかかっていないこと）
- [ ] **FR-136-07: service_role 経路の回帰テスト**
  `request.jwt.claims = {"role":"service_role"}` を `set_config` し、`ai_result` / `audio_hash` / `auto_approved` を UPDATE → 反映されること（Edge Function の自動承認シミュ）

## 受入条件

- [ ] **AC-136-01**: **Given** 認証ユーザー A、**When** 自分の post に対して `UPDATE posts SET is_official=true, ai_result='{"x":1}', ai_failure_count=0, audio_url='https://evil/', weather='sunny' WHERE id = <my-post>`、**Then** 行は更新されるが上記 5 列は OLD のまま（変化しない）。
- [ ] **AC-136-02**: **Given** 認証ユーザー A、**When** 自分の post に対して `UPDATE posts SET survey_request_id='<other-user-survey-id>' WHERE id = <my-post>`、**Then** `survey_request_id` は OLD のまま。
- [ ] **AC-136-03**: **Given** admin JWT、**When** `UPDATE posts SET status='approved', is_official=true`、**Then** 両カラム反映。
- [ ] **AC-136-04**: **Given** service_role（Edge Function 経路）、**When** `UPDATE posts SET ai_result=..., ai_analyzed_at=now(), auto_approved=true, status='approved', ai_failure_count=1`、**Then** すべて反映され従来の AI 自動承認フローが壊れない。
- [ ] **AC-136-05**: **Given** 認証ユーザー A、**When** `UPDATE posts SET user_id='<B-uuid>' WHERE id = <my-post>`、**Then** policy で deny（`with_check` 違反、`new row violates row-level security policy`）。
- [ ] **AC-136-06**: **Given** 認証ユーザー A、**When** 自分の comment 編集相当の UI 操作（`comment`, `count`, `observed_at`, `is_anonymous` を編集）、**Then** これらは従来通り反映される（保護対象外であることの回帰確認）。
- [ ] **AC-136-07**: **Given** pg-tap `rls_posts.sql`、**When** `supabase test db`、**Then** 全テスト pass。
- [ ] **AC-136-08**: **Given** `supabase db reset` 後、**When** `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE proname='protect_post_status'`、**Then** 関数本体に上記 20 列すべての `NEW.x := OLD.x` が含まれる（migration 順序による drift 防止）。
