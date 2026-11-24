# 通知 — いまの仕様

> 「いま何が正しいか」だけを書く。「そのとき何を変えたか」は `docs/requirements/REQ-*.md`（履歴）。
> 食い違ったら**コードが正**。正本: 各通知関数と `supabase/functions/_shared/mailer.ts`

経路は 2 つ。**メール**（Resend）と **Web Push**（VAPID）。どちらも Edge Function から送る。

## 既定の違い

| 経路 | 既定 |
| --- | --- |
| メール | **受け取る**（`notify_*` 列の既定が `true`） |
| Web Push | **受け取らない**（`notify_push_*` の既定が `false`） |

Push はブラウザの許可が要るので、勝手に有効にしない。

## 通知の種類

メール — 調査依頼（新規・投稿結果・終了・会話） / 投稿の審査結果 / コメント / 研究に採用された / しばらく来ていない人への声かけ / 週次ダイジェスト。

Web Push — 投稿の審査結果 / コメントが付いた / 近くの投稿。

受け取り設定は `user_profiles` の `notify_*` / `notify_push_*` 列で持つが、参照する列は通知ごとに異なる。
調査依頼の4イベントは `notify_survey_request`、ライフサイクル3関数はそれぞれの購読列を参照する。
`notify_response_digest` は現行の送信分岐では参照されない。
旧 `notify-comment` / `notify-post-status` のメール実装は購読列を参照しない。全通知に同じ配信条件があると扱わない。

コメントメールは1コメントにつき1通。送信前に `comment_notification_claims` で先取りし、重複や先取り失敗では送らない。送信失敗時は先取りを戻して再送可能にする。

## 通知失敗と本体処理

**通知が送れなくても本体の処理は止めない。**

- 共通mailerを使うライフサイクル3関数は、未設定・購読拒否等を `sent: false` として扱う。
- 個別実装の通知には、未設定・宛先なしを200のskippedとして返すものや、実送信エラーを500として返すものがある。
- 複数宛先の処理は、個々の失敗を扱いながら次へ進む経路を持つ。

DBからの非同期呼び出しの失敗は、元の投稿・審査・コメントを取り消さない。通知関数自身が常に成功応答する、という意味ではない。
起動元・配信条件・共通処理の範囲は [通知とAIの案内](../architecture/notifications-ai.md) を参照する。

## 通知起動DB関数の実行権限

通知を起動する DB 関数（`call_lifecycle_edge_function`・`call_send_push`・`call_notify_survey_request`・`call_notify_research_adopted`・`run_dormant_reengage_batch`・`run_weekly_digest_batch`・`run_ai_anomaly_check`）は **service_role だけが実行できる**。呼ぶのはトリガー・`adopt_post_research`・pg_cron で、どれも SECURITY DEFINER（所有者の権限）で動くので利用者の操作は止まらない。

**ここを anon / authenticated に開けると、公開鍵だけで任意の人へのプッシュ通知・一斉メール・Edge Function の起動ができてしまう**（2026-09-27 に見つかり REQ-316 の migration `20260926175847` で閉じた）。`call_lifecycle_edge_function` の呼び先も 3 関数に限ってある。新しい通知の入口を足すときは、同じ migration と同じ形で REVOKE / GRANT を書き、pg-tap（`supabase/tests/req316_notification_rpc_admin_guard.sql`）に 1 行足すこと。

## HTML メールのエスケープ

**利用者の入力（市町村名・コメント等）をメール本文に入れるときは必ず `escapeHtml` を通す。** 各 Edge Function がテンプレート内で呼んでいる。忘れると HTML インジェクションになる。

## 配信停止

`/u/unsubscribe` から、カテゴリ単位か全部まとめて止められる。**ログイン不要**（メールのリンクから飛べる必要があるため）。適用は `apply_unsubscribe` RPC。

## 送信元の設定

環境変数は `RESEND_API_KEY`（メール）と `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`（Push）。Edge Function の秘密情報はフロントとは別の場所に置く（`supabase secrets`）。手順は `docs/runbooks/email-authentication.md`。

**Edge Function のデプロイはフロントと別手順。** 順序事故を防ぐため runbook に従う。

## 関連

- 調査依頼の通知 — [survey-requests.md](./survey-requests.md#通知)
- 審査結果の通知 — [moderation.md](./moderation.md)
- 履歴 — REQ-234（メール基盤）・REQ-309（Edge Function の共通化）
