# REQ-279: DB性能・衛生（RLS initplanラップ・ログ保持パージ・FK索引）

優先度: **P1** ／ 深刻度: **High**（問題A・スケール時）／ 種別: DB・運用

## 背景

### 問題A: ホットテーブルのRLSが `auth.uid()`/`auth.jwt()` を行ごと再評価 — High
最も読まれる posts の SELECT ポリシー（`supabase/schema.sql:802-806`）:
```sql
CREATE POLICY "moderated_read" ON posts FOR SELECT USING (
  status = 'approved' OR auth.uid() = user_id
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```
`(select auth.uid())` でラップしないと planner が initplan 化できず**行ごとに再評価**される（Supabase 公式の既知アンチパターン）。本プロジェクトは新しめの migration（`20260603000005`、`20260703000001/000004` 等）では `(SELECT auth.uid())` を採用済みで、**古いコア＝posts/comments/likes/user_profiles など最ホットなポリシーだけ未バックフィル**（bare 108箇所 vs wrapped 11箇所）。地図/一覧で数千行スキャンのたびに行数×関数評価が走り、投稿数の増加に比例して遅くなる。

### 問題B: 追記専用ログ系テーブルに保持・パージ機構が無い — Medium〜High
- `ai_call_logs`（投稿INSERT/再解析/dedupごとに1行。`20260424000003`）
- `audit_logs`（投稿ステータス変更トリガ＋ログイン成功/失敗）
- `lifecycle_email_log`（送信/配信停止ごと）

DELETE・パーティション・cron パージが皆無（日次ビュー `ai_call_logs_daily` は90日で切るが実テーブルは無制限）。Supabase free(500MB)/pro(8GB) のディスクをログが食い潰すと最悪DB書込み全停止（投稿不可）。

### 問題C: 低トラフィックFKの索引欠如 — Low
`audit_logs.admin_id`（`get_audit_logs` の絞込で使用）、`posts.reviewed_by`、`user_badges.badge_id`、`lifecycle_email_log.post_id`。※ホット系FK（posts.user_id 等）は索引済み。

## 機能要件

- **FR-279-01**: 追補 migration で、既存ポリシー内の bare `auth.uid()` / `auth.jwt()` を `(select ...)` 形へ書き換える（`ALTER POLICY ... USING/WITH CHECK` または DROP/CREATE。**式の意味は変えない**）。`supabase/schema.sql` も同期更新する（CI rls-tests は schema.sql を適用するため必須）。
- **FR-279-02**: pgTAP の RLS テスト（`supabase/tests/`）が**変更前後で同一結果**であることをもって意味の不変を担保する。
- **FR-279-03**: ログ3テーブルに保持期間パージを追加する: `ai_call_logs` 180日 / `lifecycle_email_log` 180日 / `audit_logs` はモデレーション監査の保全要件を考慮し **365日**（要ユーザー確認。確定まで audit_logs のパージは実装しない選択も可）。pg_cron 週次ジョブ＋`created_at` 索引の存在確認。
- **FR-279-04**: 問題Cの索引を追加する（`audit_logs(admin_id, created_at desc)` は管理ダッシュボード実測が重い場合のみで可）。

## 受入基準

- **AC-01**: 全 pgTAP RLS テストが変更前後でパス（CI rls-tests 緑）。
- **AC-02**: `EXPLAIN` で posts の SELECT ポリシー評価が InitPlan 化される（`(select auth.uid())` が1回評価）。
- **AC-03**: パージジョブが `cron.job` に登録され、保持期間より古い行のみ削除する（dry-run で件数確認できる関数を用意）。

## 対象外・注意

- 本REQの migration は**本番適用前にステージング/ローカルで pgTAP を通すこと**。RLSはセキュリティ境界のため、機械的置換であってもレビュー必須。
- audit_logs の法的保持期間はユーザー判断待ち（研究データ・自治体連携の要件があれば無期限保持＋パーティション化に切替）。
