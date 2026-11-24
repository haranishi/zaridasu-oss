# Supabaseを外す前に解消する障害

確認日：2026-10-30、基点 `ab4fd3f`。コードから確かめた依存と、実測が必要な制約を分ける。
P0は対象段階の切替を止める条件、P1は本番実施までに検証する条件。本番設定の有効性は未照合。

## 認証とメールの追加障害

| ID・区分 | 障害と根拠 | 対策・合格条件 |
| --- | --- | --- |
| B01 P0 確定 | [AuthContext](../../../src/context/AuthContext.tsx)のSIGNED_OUTが端末控えを清掃 | [認証切替](auth-cutover.md)の移行用再認証/凍結を先に配布。旧SW・圏外・別UIDでも未送信を保護 |
| B02 P0 確定 | 管理者はapp_metadata。公式移行例のrole変換とは異なる | [認証設計](auth-design.md)でUUID/登録日時/Google subject/役割を全件照合。権限昇格を拒否 |
| B03 P0 要試作 | Node bcrypt/pgの公式例はWorkers/SQLite向けではない | 同costの合成hashでCPU/並行認証を測る。adapterの登録/回復transactionも検証 |
| B04 P0 未確認 | MFA・ban・重複/未確認利用者・SMTPの本番実状態 | 読み取り台帳化し、未対応は移行を止める。既存状態を通常/確認済みへ変換しない |
| B05 P1 確定 | [共通mailer](../../../supabase/functions/_shared/mailer.ts)と[停止画面](../../../src/views/UnsubscribePage.tsx)だけではone-click POSTの受け口が無い | [メール設計](email-design.md)で実POST・旧リンク・先読み・署名・抑止を検証。現行対応済みとしない |
| B06 P1 要選定 | Cloudflare Email Sendingはbeta/用途制約/アカウント日次枠がある | Resendを基本とし、週報等の用途適合と配信枠・到達・状態照合を確認してから替える |

## R2を使う段階で先に直すもの

| ID・区分 | 障害と根拠 | 対策・合格条件 |
| --- | --- | --- |
| B07 P0 確定 | [mediaFetch](../../../supabase/functions/_shared/mediaFetch.ts)はSupabase専用の公開パス2種に限定 | ホスト追加だけで済ませず、R2 binding/管理下キー取得へ変更。外部URL・path traversal・redirectを拒否し、R2切替前にAI再解析を試験 |
| B08 P0 確定 | [postMedia](../../../src/lib/postMedia.ts)と[imageUtils](../../../src/lib/imageUtils.ts)はSupabaseのURL/変換を前提 | バケット/キー参照へ移し、原本・`.ai.jpg`・音声と旧URL行の表示/削除を検証 |
| B09 P0 確定 | [social-announce](../../../supabase/functions/social-announce/index.ts)は補助Storageへmarkerを保存し、dry-runもclaimする | 観察メディア4種以外も全バケット台帳化。claim/送信/dry-run履歴を移し、過去の告知を再送しない |
| B10 P1 要試作 | R2署名URLはS3 APIドメイン用。ブラウザには別途CORSが必要 | S3署名か認証Worker配信かを選び、origin/method/headerと期限切れ再発行を実ブラウザで試す |

旧公開URLを保存したDB行・SNS・メールは自動で書き換わらない。旧URL維持/移転案内の期間を決める。
非公開URLを公開ドメインへ転送しない。CORSは所有者認可の代替にしない。
根拠：[R2署名](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[CORS](https://developers.cloudflare.com/r2/buckets/cors/)。

## ランタイムと非同期処理の追加障害

| ID・区分 | 障害と根拠 | 対策・合格条件 |
| --- | --- | --- |
| B11 P0 要試作 | [画像分析](../../../supabase/functions/analyze-image/index.ts)は最大3枚並列、[制約](../../../supabase/functions/_shared/aiSchema.ts)は画像10MB/枚・音声15MB。base64/JSONで複製が生じる | workerdで最大入力/並行実行を実測。限定並列・分割・サイズ上限を設計し、許容できなければ別実行基盤を再選定 |
| B12 P0 確定 | 14 Edge FunctionsはDeno serve/env/URL import・管理API/RPC依存 | [移植対応表](background-processing.md)の全処理を代替。invoke・旧trigger/cron停止も試験 |
| B13 P1 確定 | [geocodeThrottle](../../../supabase/functions/_shared/geocodeThrottle.ts)の制限は同一インスタンス内のみ | Nominatim継続なら全Worker共通DO等で上限制御とcache。大量バックフィルを公共APIへ投げない |
| B14 P1 要試作 | [Web Push](../../../supabase/functions/_shared/webpush.ts)は署名/暗号と購読のorigin/VAPID鍵に依存 | Web origin・鍵・UIDを維持。workerd暗号と実端末受信/失効を確認。変更時は再購読導線を用意 |
| B15 P0 確定 | [backup](../../../scripts/backup-db.sh)・[Storage backup](../../../scripts/backup-storage.sh)・migration/deploy-lag検査はSupabase前提 | Authも含む新DB/R2の暗号化backup・鮮度/件数・隔離復元へ置換。旧Secret削除によるskipを成功としない |

Workersのメモリ上限はisolate単位128MB、HTTP応答後のwaitUntil延長は30秒。CPUと外部API待ち時間を分けて測る。
AIをHTTPの応答後処理へ単純移植せず、Queue consumerで処理する。Queuesは少なくとも1回配信を前提とする。
メッセージへ画像/音声本体を入れずID/キーを渡し、最新の上限・CPU/実行時間・再試行回数を設定する。
根拠：[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)、[Queues制限](https://developers.cloudflare.com/queues/platform/limits/)、
[配信保証](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)、[Nominatim方針](https://operations.osmfoundation.org/policies/nominatim/)。

## 既存の障害と廃止条件を結び付ける

Node Proxy、Edge OG route、vinext/webpack、ISR/画像TTL、Sentry/IP信頼境界は[初回調査](research.md)を引き継ぐ。
PostGIS/Realtime購読は初回のコード調査で未検出。存在を前提にした移植作業は増やさない。
既存のRLS/GRANT/RPC・行ロック・退会・公開投影の移植は[DB判断](database-decision.md)の合格条件を維持する。
本番cron/Vault/Webhook・補助バケット・実入力サイズ・配信枠・復元実績は未確認のため、実施前に照合する。
本番切替前に各B番号へ担当・証拠・対象段階を付け、未解消P0があればその段階を開始しない。
