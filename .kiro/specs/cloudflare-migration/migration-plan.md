# 準備をそろえてから、Web・メディア・DBの順で進める

状態：実施手順の設計案。今回は全段階が未実施。切替操作は[専用手順](cutover-and-rollback.md)へ。

## 開始前に必要なもの

| 必要なもの | 用途と確認方法 |
| --- | --- |
| Cloudflareの運用アカウント | 所有者・研究/事業の区分・支払担当・Workers権限・DNS権限・予算通知を決める |
| Tursoの検証用アカウント | 第一候補のエンジン・プラン・リージョン・復元機能・専用トークンを確認。D1なら環境別binding |
| 隔離した検証環境 | 合成データ、開発用Auth/メール/AI、preview専用R2。実データ・本番鍵を流用しない |
| 現行構成の読み取り台帳 | 配備版、migration履歴、Auth/OAuth/SMTP/Turnstile、バケット、cron、Vault/Webhook、DNS、監視を照合 |
| 容量・負荷・費用の実績 | DB/バケット別容量・日増加・読書き・月間通信・変換回数・ピーク同時数を測る |
| CI・配備の権限 | 環境別Secretsと最小権限トークン。公開設定と秘密を分離し、値は文書に載せない |
| 復旧の準備 | 最新の暗号化バックアップ、復号鍵の保管者、隔離復元結果、旧配備版、DNS退避、連絡先 |
| 実施条件 | 移行責任者、予算上限、停止枠、RPO/RTO、合否閾値、監視期間、切り戻し判断者 |
| 認証/メール台帳 | UUID/Google identity/管理者/MFA/ban/hash方式/SMTP、購読/抑止/枠/送信DNSを照合。秘密値は記録しない |

Webの `zaridasu.com` と通知送信元の `zarigani-das.com` は役割が異なる。
[メール認証方針](../../../docs/runbooks/email-authentication.md)に従い、両者を無断で統合しない。
DNSが既にCloudflareにあるか確認し、ネームサーバー変更を必須作業と決めつけない。
previewでのメール・Push・SNS送信は検証宛先に限定する。

## P0：方式を確かめ、実施仕様を確定する

OpenNextとvinextの小さな試作で、Proxy・Edge route・Sentry・ISR・画像・Wasm/PWA・容量予算を検証する。
vinextはbetaかつwebpack設定非対応。現行webpack pluginとchunk分割を移す費用も比較する。
`/api/og` は参照を調べてから移植/撤去を判断し、未使用と決めつけない。
Turso/D1の[共通試験](database-decision.md)と[認証試験](auth-design.md)で、DB/adapter/hashの組合せを決める。
認証/メールと[障害台帳](migration-blockers.md)の試作・廃止ゲートも確定する。未対応MFA等があれば切替を止める。
合格条件を満たせない場合は現在の構成を継続し、公開を急ぐために検査を省かない。

## P1：WebだけをWorkersへ移す

Supabaseの全サービスを維持し、まずWeb配備だけを変える。
選んだadapter・Wrangler・compatibility dateを固定し、環境変数とpreview/productionを分離する。
既存prebuild、Wasm/SW生成、PR品質ゲート、migration-gateを残す。自動配備元は1つにする。
ISR用R2/DOと業務メディア用R2は別用途で、キャッシュ用D1の追加も業務DB移行と区別する。
静的資産の `_headers` だけでSSR/APIの防御を済ませず、両経路のCSP等を確認する。
既存URL・canonical・OGP・sitemapを維持し、承認した停止枠と[切替ゲート](cutover-and-rollback.md)で配信先を変える。

## P2：メディアをR2へ移す

DBはSupabaseを正本のまま、参照をバケット/キー/公開区分で扱えるようにする。
4バケットの台帳を作り、同じキーで初回コピー→ハッシュ照合→差分同期する。署名URLはコピーせず再発行する。
補助SNS marker等も含め全バケットを棚卸しする。AIのURL検証・派生画像清掃・CORSはR2切替より先に直す。
WebだけでなくAI取得・SNS・退会清掃・バックアップの利用先も移す。旧URLを残す期間と読取りfallbackを定める。
アップロードと削除を一時停止し、最終差分・件数/ハッシュ/公開性を照合して書込み先をR2へ切り替える。
旧Storageは保持し、旧URL参照と削除失敗を監視する。切替後の追加/削除差分は復旧用に追跡する。

## P3：API境界を作り、業務DBを移す

まずSupabaseを裏側にしたWorkers APIへ直呼びを置き換え、認可の同等性を確認する。
生のSQLや任意RPC名を受け付けず、既存data層から用途別に移す。旧APIの書込み権限を閉じる時点も定義する。
Supabaseを利用者JWTで呼ぶ期間はRLSを維持し、管理権限で迂回する期間はAPI側の検査を先に通す。
その後に採用DBへスキーマ・関数・権限・Outboxを実装し、Auth境界と退会補償を検証する。
関連表は原子的更新の単位でまとめる。強く結び付く投稿・所有者・審査・監査を無理に別DBへ分散しない。
合成データ照合、隔離リハーサル、最終停止コピーを経て、業務DBの読書きと非同期起動元を一度に切り替える。
旧DBのAI/cron/トリガーを停止し、再開位置・Outbox残件・二重通知を検査する。
全14処理を[移植対応表](background-processing.md)で追跡し、通知は[メール設計](email-design.md)に従う。
移行中のメール宛先はAuth管理APIを使い、認証切替で新認証DBの内部照会へ移す。

## P4：認証とメールの残存依存を外す

[認証設計](auth-design.md)のBetter Auth案を先に検証し、合格後に[認証切替](auth-cutover.md)で全員を再認証する。
切替前に移行対応クライアントを配布し、古いタブ/SWと圏外端末の未送信を保持できることを確認する。
メールはResend継続を基本とし、Supabase SMTPから新Auth hookへ移す。通知の宛先/購読/抑止も照合する。
Cloudflare Sendingへの変更は独立段階とし、用途/枠/到達/結果照合が成立したメール種別だけを対象にする。
認証と業者を同時に替えず、旧リンク・セッション・資格情報変更を含む復旧をリハーサルする。

## P5：安定確認してから旧資産を縮小する

提案として各切替後7日間監視し、復元訓練と差分照合後、保管期間と削除対象を改めて決める。
Supabase Authを残す間は契約とAuth用DBを維持する。業務DBを空にしただけで解約しない。
Auth/Storage/DB/Edgeの全廃ゲートを確認する。旧資産削除・契約解約は移行承認と分けて対象を確認する。
研究日程と利用者への影響を確認して実施日を決め、過去見積りの日程を自動的に実施予定にしない。

## 費用と工数は利用実績から再見積りする

月額はWorkers＋R2（容量/操作）＋キャッシュ用DO等＋Images＋業務DB＋Auth＋監視/外部AI＋移行中の旧環境で算出する。
[Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[R2](https://developers.cloudflare.com/r2/pricing/)、
[D1](https://developers.cloudflare.com/d1/platform/pricing/)、[Images](https://developers.cloudflare.com/images/pricing/)、
[Turso](https://turso.tech/pricing)、[Supabase](https://supabase.com/pricing)を実施時に照合する。
Vercelは他アプリが残れば契約費が残る。無料枠の合算だけで移行後の総額や節約を保証しない。
P0の計測後、Web移行とDB再設計を別々に工数見積りする。過去のWeb移行見積りをDB移植へ流用しない。
