# 認証メールと通知メールを分け、当面はResendで配信する

状態：追加設計案、2026-10-30。今回は送信・DNS変更を行わない。[認証設計](auth-design.md)と併読する。
基本案は、認証をBetter Authへ移した後もResendを使い、メールの起動・宛先決定をWorkersへ移すこと。
これでSupabaseへの依存は外せる。配信業者の変更は認証移行と別の切替単位にする。

## Cloudflare Email Sendingも比較し、用途と到達性で選ぶ

| 比較軸 | Resend継続（基本案） | Cloudflare Email Sending（対案） |
| --- | --- | --- |
| 現状からの差 | HTTP送信と既存Fromを再利用 | bindingまたはREST/SMTPへ変更 |
| 認証メール | 移行中はSupabase→SMTP、撤去後はBetter Auth hook→HTTP | hook→binding。移行中SMTP案も検証可能 |
| 到達と抑止 | Webhookとsuppressionを接続 | Event subscription→Queuesとsuppressionを接続 |
| 重複抑止 | API Idempotency-Key＋自前台帳 | 同等保証は未確認。台帳と結果不明時の照合を設計 |
| 前提 | ドメイン検証・送信枠・専用キー | Cloudflare DNS・Workers Paid・ドメイン設定・日次枠 |
| 注意 | SMTPとHTTPの重複保証は同一ではない | beta、transactional専用。休眠復帰/週報の用途適合は別確認 |

Email Routingは受信/転送機能。任意の利用者への送信はEmail Sendingとして設定する。
週報・休眠復帰を全てtransactionalと決めつけず、用途不適合ならResend等へ残す。
Cloudflare案の採用条件は、実到達性、費用/枠、送信状態照合、抑止同期が基本案と同等に成立すること。
根拠：[概要](https://developers.cloudflare.com/email-service/)、[設定](https://developers.cloudflare.com/email-service/get-started/send-emails/)、
[用途](https://developers.cloudflare.com/email-service/reference/faq/)、[制限](https://developers.cloudflare.com/email-service/platform/limits/)。

## 送信種別と条件を引き継ぐ

| 種類 | 起動元・宛先と条件 |
| --- | --- |
| 確認・再送 | Auth→確認対象メール。短命/一回限り。再送上限と古いchallengeの扱いを定義 |
| 回復・メール変更 | Auth→検証済み/変更対象。存在を漏らさない応答、最近の本人確認、旧/新宛先確認 |
| 投稿status・コメント | 業務Outbox→投稿本人。現行は共通購読列を見ないため、移行で黙って購読契約を変更しない |
| 調査依頼4種 | Outbox→地域/依頼者/参加者。現行フラグと対象選定、送信直前の停止/退会確認 |
| 研究採用・休眠・週報 | Outbox/Cron→対象本人。現行カテゴリ購読・履歴・間隔を維持 |
| AI障害等 | 運用ジョブ→運用者。閾値と間隔を維持し、メール障害の検知には別経路も用意 |

正本：[現行通知](../../../docs/architecture/notifications-ai.md)。コメント/statusの購読改善は別の仕様判断とする。
既存の「all」を認証メール停止へ拡張しない。通知拒否とhard bounce/complaintによる配信抑止は別に保持する。
宛先は移行中はAuth管理API、撤去後は認証DBの内部照会で取得し、公開プロフィールへ複製しない。
キューはイベントID/利用者ID/テンプレート版を基本とし、送信直前に宛先・購読・退会・抑止を再確認する。

## 認証メールは短命の専用経路で送る

Supabase中はSMTPの実状態を確認し、認証切替時にBetter Authの送信hookへ移す。
ライブラリのchallenge生成/消費を使い、challengeと送信予約の耐久化後に認証APIを一律応答させる。
送信hookは配信業者の応答を待たず、短命の優先送信処理へ渡す。存在するメールだけ配信待ちする分岐を作らない。
送信予約の機密payloadは保護されたDBへ暗号化/TTL付きで置き、Queueには予約IDだけを渡す。
永続化失敗とQueue投入漏れは監視/回収し、期限切れは送らない。平文token/完全URLはQueueやログへ置かない。
存在有無と業者遅延を振った応答時間試験を行う。[公式の非同期化方針](https://better-auth.com/docs/concepts/users-accounts)を確認する。
認証メールのリンク書換え/クリック計測は無効にし、ログとSentryからtoken・query・宛先を除去する。
先読みGETで確認/回復が完了しない方式を選び、利用者の確認操作と一度限りの消費を試験する。
HTML/textと入力escapeを用意する。locale未保存の現行状態を、4言語自動選択済みと扱わない。

## 通知はOutboxと送信台帳で状態を持つ

業務更新とOutboxを同じtransactionで確定し、Queue投入失敗は未送信Outboxから回収する。
送信台帳は `event_id + recipient_id + category + template_version` を一意にする。
`pending / leased / accepted / delivered / suppressed / failed / unknown`、試行時刻、業者message IDを記録する。
Resendは同じ試行のpayloadとIdempotency-Keyを再利用する。24時間の保持窓を越えた結果不明は自動再送しない。
429/一時障害は期限/上限付きbackoff、認証/設定エラーは隔離する。手動再実行も元の業務IDと照合する。
応答紛失時は `unknown` へ移し、照合前に別業者へfallbackしない。API受付・相手サーバー受信・開封を区別する。
外部の厳密な一度限りの配信や到達は保証しない。[Resend重複抑止](https://resend.com/docs/dashboard/emails/idempotency-keys)を参照。

## 配信停止・バウンス・苦情を移す

旧 `/u/unsubscribe?t=...&c=...` は維持し、既存の不透明tokenをハッシュ照合できる形へ移す。
新規tokenもDBにはハッシュを置き、token・メール・UIDを公開レスポンスやログへ出さない。
本文リンクと受信側のone-click POSTを別経路で実装する。現行のJSページだけでPOST対応済みとはしない。
POSTはtoken検証で成立させ、ログイン不要・重複適用可とする。GETは確認画面とし、先読みで停止しない案を採る。
このGET変更は現行の着地時自動停止からの変更として、旧メールと利用体験を回帰確認する。
Resend Webhookはraw body・署名・時刻を検証し、イベントIDと状態更新を同時確定してから2xxを返す。
順序逆転したイベントでhard bounce/complaintの抑止を解除せず、業者/アプリ双方へ同期する。
Cloudflare案は専用Queueのaccount/domain/sourceを限定し、同じ台帳へイベントを変換する。
抑止を別業者で回避せず、認証も送れないときのアドレス訂正/サポート手順を用意する。
根拠：[Resend署名](https://resend.com/docs/webhooks/verify-webhooks-requests)、[Cloudflareイベント](https://developers.cloudflare.com/email-service/reference/event-subscriptions/)。

## DNS・配信枠・切替を確認する

Fromは `zarigani-das.com`、Web専用は `zaridasu.com` の方針を保つ。受信MXは送信移行と同時に替えない。
SPFは同じ名前に1本、DKIMは業者別selector、DMARCはFromとの整合を確認し、既存rejectを無断で弱めない。
旧新DNSと抑止を必要期間併存させ、実施承認後に管理下のGmail/Outlook等でヘッダーと認証操作を試す。
登録ピーク/再送/通知の合算で枠を確保し、認証用の容量・優先度を通知から分離する。
切替後の新規抑止・配信停止・送信台帳を逆反映できるようにし、旧基盤へ戻しても拒否解除や再送をしない。
今回、送信・DNS操作・鍵発行は未実施。料金、実到達性、送信枠は実施前の検証項目とする。
