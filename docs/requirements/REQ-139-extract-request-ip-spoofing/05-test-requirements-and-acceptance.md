### テスト要件

- [ ] **FR-139-06: pg-tap テスト — `extract_request_ip()`**
  `supabase/tests/extract_request_ip.test.sql` を新設:
  - **case A**: `request.headers = '{"cf-connecting-ip":"1.2.3.4","x-forwarded-for":"99.99.99.99,1.2.3.4"}'` のとき戻り値が `1.2.3.4`（cf-connecting-ip 優先）
  - **case B**: `request.headers = '{"x-forwarded-for":"99.99.99.99, 1.2.3.4"}'`（cf なし）のとき戻り値が `1.2.3.4`（末尾採用）
  - **case C**: `request.headers = '{"x-real-ip":"1.2.3.4"}'`（xff なし）のとき戻り値が `1.2.3.4`
  - **case D**: ヘッダー全部空のとき戻り値が NULL
  - **case E（regression）**: 旧実装で `99.99.99.99` を返していた偽装ケースで、新実装は `1.2.3.4` を返す

- [ ] **FR-139-07: pg-tap テスト — `check_post_rate_limit()` IP 偽装耐性**
  `supabase/tests/check_post_rate_limit_spoofing.test.sql` を新設:
  - **case A**: 同じ `cf-connecting-ip` で 4 件目の INSERT が 1 分以内に来たら例外
  - **case B**: クライアントが `x-forwarded-for` を毎回ランダム化しても、`cf-connecting-ip` が固定なら 4 件目で例外
  - **case C**: `user-agent` を毎回変えても、同じ IP なら制限が効く
  - **case D**: IP も UA も完全に異なる 2 セット間では独立にカウント（False Positive がない）

- [ ] **FR-139-08: pg-tap テスト — 匿名投稿スイッチ**
  `supabase/tests/anonymous_post_switch.test.sql`:
  - `anonymous_post_enabled = FALSE` のとき匿名 INSERT が例外で拒否
  - 認証ユーザー INSERT は影響なし
  - `anonymous_post_enabled = TRUE` に戻したら匿名 INSERT 復活

- [ ] **FR-139-09: 統合テスト（既存 RLS テストとの整合）**
  既存 `supabase/tests/` 配下の post / audit_logs テストが本 migration 適用後も通過することを確認。特に REQ-034 (posts RLS column protection) のテストとの整合を verify。

## 受入条件

- [ ] **AC-139-01**: **Given** `request.headers = '{"cf-connecting-ip":"203.0.113.10","x-forwarded-for":"198.51.100.99,203.0.113.10"}'`、**When** `SELECT extract_request_ip()`、**Then** 戻り値は `203.0.113.10`（cf-connecting-ip 優先）。
- [ ] **AC-139-02**: **Given** `cf-connecting-ip` がなく `x-forwarded-for = "198.51.100.99, 203.0.113.10"`、**When** 同上、**Then** 戻り値は `203.0.113.10`（末尾採用）。
- [ ] **AC-139-03**: **Given** 攻撃者が `x-forwarded-for: 1.1.1.1` を 1 件目、`2.2.2.2` を 2 件目に偽装、`cf-connecting-ip = 203.0.113.10` で固定、**When** 匿名 INSERT を 1 分以内に 4 回試行、**Then** 4 回目で `投稿が集中しています` 例外。
- [ ] **AC-139-04**: **Given** `posts.reporter_ip` および `reporter_ua_hash` カラム、**When** 匿名 INSERT、**Then** `reporter_ip` は `cf-connecting-ip` の値、`reporter_ua_hash` は `md5(user-agent)` の 32 文字 hex で保存される。
- [ ] **AC-139-05**: **Given** `system_settings.anonymous_post_enabled = FALSE`、**When** 匿名 INSERT、**Then** `匿名投稿は現在停止中です` 例外。
- [ ] **AC-139-06**: **Given** 同上設定、**When** 認証ユーザー INSERT、**Then** 正常に挿入される。
- [ ] **AC-139-07**: **Given** REQ-034 既存テスト、**When** 本 migration 適用後に再実行、**Then** 全テスト通過（regression なし）。
- [ ] **AC-139-08**: **Given** `request.headers = '{}'`、**When** `extract_request_ip()`、**Then** NULL を返し、既存の「IP 不明時の 1 分 3 件制限」（user_id NULL 時）が引き続き効く。
