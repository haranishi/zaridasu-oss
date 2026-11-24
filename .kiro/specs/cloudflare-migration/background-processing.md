# 14のEdge処理をHTTP・Queue・Cronへ移し、起動元を一本にする

状態：追加設計案。現行は[Edgeガイド](../../../docs/architecture/edge-functions.md)を正とする。
同じWorkerへ全処理を詰めず、公開API・認証・重い分析・通知の実行権限と負荷を分ける。
SupabaseのDeno関数はそのまま配備せず、env/URL import/serve/管理API/RPCを移植する。

## 代替先と許可する入口

| 現行関数 | 移植先 | 起動と権限 |
| --- | --- | --- |
| analyze-image | AI Queue consumer | 投稿Outbox。再分析は所有者/管理者APIで上限を確認してenqueue |
| analyze-audio | AI Queue consumer | 音声更新Outbox。同じ投稿/入力versionの画像結果との整合を検査 |
| enrich-place | 地名Queue consumer | 投稿Outbox。原座標は非公開の内部照会で取得 |
| health-gemini | 管理HTTP API | 現在の管理者session/役割を検証。明示操作のみ、通常分析費用と区別 |
| notify-comment | 通知Queue consumer | コメント作成Outbox。実在/所有者/宛先/自分への通知除外を再検査 |
| notify-post-status | 通知Queue consumer | 審査状態変更Outbox。現在の公開状態と通知対象versionを検査 |
| notify-survey-request | 通知Queue consumer | 依頼4イベントOutbox。対象者/購読を再照会 |
| notify-research-adopted | 通知Queue consumer | 採用更新Outbox。採用状態/通知済み/購読を確認 |
| notify-dormant-reengage | Cron producer→通知Queue | 現行の休眠/再送間隔と購読で対象を抽出 |
| notify-weekly-digest | Cron producer→通知Queue | 地域/期間/新着/購読で抽出。対象期間を固定 |
| notify-gemini-key-failure | 監視Cron→運用通知Queue | 認証障害の閾値/通知間隔/送信済み状態を維持 |
| notify-ai-anomaly | 監視Cron→運用通知Queue | 標本/率/集中等の条件とkill switchを維持 |
| send-push | Push Queue consumer | 通知Outbox。有効購読/カテゴリ/所有者、404/410の無効化 |
| social-announce | 運用Cron/管理API→SNS Queue | 投稿選定とclaim。既存marker/dry-run/送信済みを区別 |

一覧は廃止の対応表であり、14個のWorkerを必須とする意味ではない。
内部処理はbinding/Queueの権限で接続し、外部から管理鍵を渡して任意の内部RPCを実行できる入口を作らない。
旧 `functions.invoke` の利用箇所は用途別APIへ移し、Auth撤去後のJWT検証と宛先照会も新基盤へ移す。

## 再試行と並行実行で結果を壊さない

Queue投入前に業務DBのOutboxへ同時commitし、未送信走査で投入漏れを回収する。
消費側はイベントID・入力version・処理種別を一意にclaimし、期限付きleaseでクラッシュ後の再開を可能にする。
外部待ち中にDB transactionを保持しない。結果反映時に投稿の最新version/削除状態を再検査する。
入力変更後に返ったAI結果や地名、退会後の通知を採用しない。画像/音声の同時完了で審査値を上書きしない。
配信は重複し得るので、[メール台帳](email-design.md)・Push失効・SNS claimも操作ごとに照合する。
削除済み/非公開化済みの記録をDLQ再実行で復活させず、手動再実行も権限と最新状態を確認する。

CronはUTCで設定し、現行の対象期間と利用者向け日付を照合する。
`job_name + period + recipient/event` を一意にし、遅延/重複Cronで同じ週報や再通知を増やさない。
送信業者の停止時は業務記録を巻き戻さず、Queue滞留・最古イベント・DLQ・重複claimを監視する。

## AI・地名・Push・SNSの固有条件

AIは入力サイズと並列数を制限し、Queueへはメディアキーを渡す。R2切替前に専用取得経路を作る。
原本hash・AI用縮小版・重複判定/キャッシュ・利用者/呼出者上限・費用記録・kill switchを維持する。
外部APIのtimeout/retryとconsumerの上限を合わせる。最大入力/再試行が収まらなければ実行基盤を再検討する。
地名の外部API上限は全consumerで共有し、過去データの一斉再取得を起動しない。
Pushは既存origin/VAPID鍵・購読所有者を保持し、FCM/APNs等で到達と失効を実端末試験する。
SNSの補助markerは非公開の処理台帳へ移す。既存のdry-runを実送信完了とみなさず、再告知対象にも自動で戻さない。

## Supabase Edge/cronを止めるゲート

全14処理の正常・拒否・部分失敗・再試行・重複・削除競合と、代替先の配備版を確認する。
切替停止枠で旧trigger/cron/外部schedulerと処理中イベントを台帳化し、排出または再開位置を記録する。
旧起動元を停止してから新producerを有効にし、両系から送らないことを確認する。
旧関数を残す間も本番鍵の権限と呼出元を制限する。呼ばれていない証拠と保管期間を確認して廃止する。
旧deploy-lagやmigration-gateのskipを代替検査の成功とせず、新schema/Worker/Queueの版・滞留・backupを検査する。
