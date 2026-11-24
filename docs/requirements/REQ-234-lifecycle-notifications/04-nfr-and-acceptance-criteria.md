### 非機能要件（該当する場合のみ）

- [ ] NFR-234-01: **fail-soft の維持。** ライフサイクル関数は `RESEND_API_KEY` 未設定・個別宛先の送信失敗・pg_net/pg_cron 未有効でも **本処理を止めない**（既存 `notify-survey-request/index.ts:130,261-270` の「個別失敗は続行」、`20260425000004_*.sql:44-47` の no-op 方針を踏襲）。バッチは部分失敗しても次回実行で回復できる冪等設計にする。

- [ ] NFR-234-02: **多重送信・スパム化の防止。** 研究採用通知は投稿あたり 1 回、休眠復帰は再送間隔の下限を守る、週次ダイジェストは週 1 回——を「送信済み記録」で保証する。重複起動（pg_cron の二重発火等）でも二重送信しないこと。

- [ ] NFR-234-03: **PII・位置情報の最小掲載（REQ-211 と整合）。** メール本文に **緯度経度の生値・通報者 IP（`posts.reporter_ip`、REQ-179 で REVOKE 済み）・他人を特定し得る情報を載せない**。地域情報は市区町村粒度の集計までに留める。配信停止トークンは `auth.users.id` を直載せせず署名付きにする（列挙・推測耐性）。

- [ ] NFR-234-04: **ドリフト防止・冪等性。** 追加する SQL は冪等（`CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS` / `ALTER ...`）で、`schema.sql` と migration の定義を一致させる（過去 migration は改変せず新規連番で追補）。`npm run schema:check`（`package.json` の schema/型同期）が green であること。

- [ ] NFR-234-05: **シークレット非露出。** `RESEND_API_KEY`・`WEBHOOK_SECRET`・配信停止トークン署名鍵・`vault` 内の service-role key の生値はコード/ドキュメント/メール本文に書かない。`.env.example` には変数「名」のみ追記する。

- [ ] NFR-234-06: **到達性は REQ-219 に依存。** 本 REQ は送信「種類とトリガー」に集中し、SPF/DKIM/DMARC の整備は REQ-219 を前提とする。List-Unsubscribe 付与（FR-234-01）は到達性・苦情率の改善にも資するが、DNS 認証そのものは本 REQ では扱わない。

## 受入条件

- [ ] AC-01: `supabase/functions/_shared/` にメール送信共通ユーティリティが存在し、(a) List-Unsubscribe ヘッダ付与、(b) 購読フラグによる送信ゲート、(c) `RESEND_API_KEY` 未設定時 fail-soft、を提供している。新規ライフサイクル関数がこれを利用している。
- [ ] AC-02: `user_profiles` に `notify_research_adopted` / `notify_dormant_reengage` / `notify_weekly_digest`（`boolean NOT NULL DEFAULT true`）が追加され、`schema.sql` と migration が一致している。配信停止トークンが `auth.users.id` 直載せでない（署名付き）。
- [ ] AC-03: `src/views/ProfilePage.tsx` で 3 カテゴリの opt-in/out をユーザーが切り替えて保存でき、ja/en/ko/zh で文言が表示される。メールの List-Unsubscribe / 本文リンクからワンクリックで配信停止でき、配信停止ページが 4 言語対応である。
- [ ] AC-04: 研究採用イベントを表すデータが `is_official` と分離して定義され、更新が管理者/サービスロールに限定（保護トリガー）かつ `audit_logs` に記録される。採用された投稿の投稿者へ **研究採用通知が 1 回だけ**送られ、匿名投稿・opt-out ユーザーには送られない。本文に座標/PII が含まれない。
- [ ] AC-05: 休眠復帰メールが「直近 14 日無活動」のユーザーにのみ送られ、再送間隔の下限が守られている（同一ユーザーへ短期に再送されない）。本文の地域情報が市区町村粒度の集計に留まる。
- [ ] AC-06: 週次ダイジェストが opt-in ユーザーへ週 1 回送られ、本文がそのユーザーの市区町村の週次集計（件数・種別内訳・人気）で構成され、全件転送・座標掲載が無い。最終活動日時ビュー/関数が新設されている。
- [ ] AC-07: pg_cron による日次/週次ジョブが migration で定義され、pg_net 経由で対象 Edge Function を起動する。pg_cron/pg_net 未有効環境では no-op で安全に失敗する。runbook に有効化チェックが記録されている。
- [ ] AC-08: ライフサイクルメールの送信数・配信停止数・(可能なら) bounce/complaint が記録され、カテゴリ別配信停止率が監視できる。閾値超過時に頻度を下げる/止める運用ルールと、成功指標（復帰率・継続率）が文書化されている。
- [ ] AC-09: 既存の取引通知 4 関数（`notify-post-status` / `notify-comment` / `notify-survey-request` / `notify-gemini-key-failure`）の挙動が本 REQ で変わっていない（回帰なし）。`npm run schema:check` と CI（既存テスト）が green。
