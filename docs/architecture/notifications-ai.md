# 通知は本体の保存を妨げず、経路ごとに配信条件を持つ

メールはResend、Web PushはVAPIDを使い、どちらも[Edge Functions](edge-functions.md)から送る。AI分析そのものは[別ページ](notifications-ai-analysis.md)を参照する。
通知の失敗で投稿・コメント・審査を巻き戻さない。一部のEdge関数は送信失敗をHTTP 500で返すため、「すべての通知関数が常に200を返す」という意味ではない。

## メールの購読設定は全経路で共通ではない

| 経路 | 参照する設定と宛先 |
| --- | --- |
| 研究採用 | `notify_research_adopted`。採用された投稿の本人 |
| 休眠復帰 | `notify_dormant_reengage`。既定14日無活動、既定30日以内の再送を除外 |
| 週次ダイジェスト | `notify_weekly_digest`。市区町村設定があり直近の送信対象になっていない本人 |
| 調査依頼の4イベント | `notify_survey_request`。新規依頼は同地域の人、結果は依頼者、終了は協力者、会話は参加者 |
| 投稿statusのメール | `notify-post-status`の個別実装。現在はプロフィールの購読列を参照しない |
| 投稿コメントのメール | `notify-comment`の個別実装。現在はプロフィールの購読列を参照しない。自分の投稿へのコメントは除外 |
| AI障害・異常の管理者メール | 運用宛先と閾値設定。利用者向け購読設定とは別 |

メール購読列の既定はtrue。`notify_response_digest`列もあるが、現行Edgeコードでは読まれておらず、独立した応答ダイジェストの配信条件としては使われていない。
「メールを止める設定がすべてのトランザクション通知にも効く」と説明しない。新規の通知を足す際は、どの配信契約に載せるかを決める。

## 共通mailerはライフサイクル3種類を担当する

[_shared/mailer](../../supabase/functions/_shared/mailer.ts)は研究採用・休眠・週次の3関数が使う。
プロフィールとカテゴリの購読、認証側のメールアドレスを確認し、不透明な`unsubscribe_token`を配信停止リンクへ入れる。user_idを配信停止の鍵にしない。
`RESEND_API_KEY`なし・宛先なし・購読拒否・プロフィールなしは`sent:false`と理由を返す。実送信エラーは例外となり、バッチ呼び出し側が宛先ごとに扱う。
List-Unsubscribeヘッダーと本文リンクを付け、本文に埋め込む利用者入力はescapeHtmlを通す。フッターは4言語を持つが、利用者のlocale列が無いため既定配信は日本語である。

`/u/unsubscribe`はログイン不要で、`resolve_unsubscribe_token`／`apply_unsubscribe` RPCがカテゴリまたはallを適用する。
送信後の記録は共通mailerの責務から分け、呼出元が`record_lifecycle_email`を使う。研究採用の通知済み列もこのRPCで更新する。

## 送信履歴は重複を減らすが、外部送信と原子的ではない

研究採用は通知済み日時、休眠と週次は`lifecycle_email_log`で再送間隔を制限する。地域の新着が0件なら週報を送らない。
対象抽出と送信、送信後のDB記録は1つのトランザクションではない。並行起動や送信成功後の記録失敗では再配信し得るので、「必ず1通だけ」と保証しない。
調査依頼の通知はイベントごとに送る仕組みで、ライフサイクルと同じ履歴ガードを持つわけではない。
旧`notify-comment`は送信者JWTと実在コメント、`notify-post-status`は秘密付きWebhookとDBの最新statusを信用する。ペイロードの本文をそのままメールにしない。

## Web Pushはブラウザ許諾とカテゴリを分けて保存する

`push_subscriptions`には本人のendpointと公開鍵素材、有効状態を保存する。メールとは別に`notify_push_post_status`／`notify_push_comment`／`notify_push_nearby`を持ち、既定falseで始める。
ブラウザの購読と画面は[frontend](frontend.md)、Service Workerの受信は[offline](offline.md)を参照する。

[send-push](../../supabase/functions/send-push/index.ts)は秘密を検証し、カテゴリ指定時は対応フラグを調べ、service-role RPCで有効な購読だけを取る。
VAPID鍵が無い・購読なし・カテゴリ拒否ならスキップする。送信は端末ごとに逐次行い、404／410相当の失効は無効化、一時障害は有効のまま残す。
category省略時はカテゴリの拒否判定を行わないため、内部の送信元が正しいカテゴリを渡す必要がある。
`sent`／`expired`／`failed`は端末別の試行結果で、利用者が通知を見たことを表さない。本文に機密位置や個人情報を含めない。

フロントの公開鍵名は`NEXT_PUBLIC_VAPID_PUBLIC_KEY`、Edgeが読む鍵名は`VAPID_PUBLIC_KEY`／`VAPID_PRIVATE_KEY`である。名前が同じ設定場所だと考えない。
DBトリガーの`call_send_push`などは[REQ-316](../../supabase/migrations/20260926175847_req316_notification_rpc_and_admin_guard.sql)でservice-roleに限定する。一般利用者へRPCを開けて直接送らせない。

## AIの障害警告は利用者向け通知と別の監視ループ

`notify-gemini-key-failure`は既定で直近1時間のgemini_authが3件以上、同種の警告が24時間以内に未送信なら管理者へ送る。
`notify-ai-anomaly`は`detect_ai_anomalies` RPCから、自動承認率、単一利用者／IPの集中、総呼出数の急増を読む。標本不足の窓を率の判定から外す。
いずれも`admin_alerts.notified_at`で重複を抑え、宛先・送信鍵が無ければスキップする。`health-gemini`の能動診断はAIコストログへ入れず、障害件数と混ぜない。
ログのエラー本文は[aiLogging](../../supabase/functions/_shared/aiLogging.ts)で鍵・Bearer・メール・IPを除去する。現行コードの秘匿化対象と、実配信の到達性は別の確認事項である。

運用は[lifecycle-notifications](../runbooks/lifecycle-notifications.md)・[web-push](../runbooks/web-push.md)・[email-authentication](../runbooks/email-authentication.md)・[ai-anomaly-detection](../runbooks/ai-anomaly-detection.md)から必要なものを選ぶ。
コード検査は[mailerテスト](../../supabase/functions/_shared/__tests__/mailer.test.ts)・[webpushテスト](../../supabase/functions/_shared/__tests__/webpush.test.ts)・各通知関数のテストと[通知RPCのSQLテスト](../../supabase/tests/req316_notification_rpc_admin_guard.sql)。本番の到達・DNS・鍵・定期起動は今回の文書化では未検証である。
