# Supabase撤去後の認証はBetter AuthをWorkersで動かす案を先に試す

状態：追加設計案、2026-10-30。採用・実装は未承認。今回は認証設定を変更しない。
切替・復旧は[認証切替](auth-cutover.md)、送信処理は[メール設計](email-design.md)へ。

## 第一候補と対案

| 案 | 判断と条件 |
| --- | --- |
| Better Auth＋Workers＋採用DB | 第一検証候補。メール/Googleログインを維持し、認証を独自実装せずCloudflare主体で運用する |
| Clerk等の管理サービス | 自前の認証運用を減らす対案。費用・UID対応・hash取込み・メール制御とデータ保管条件を比較 |
| Supabase Auth継続 | 業務API/DB移行中の構成。認証の採用条件を満たせない場合も維持し、廃止を急がない |

Better Authでは脆弱性対応、セッション失効、鍵、バックアップを運営が持つ。この負担も選定費用に含める。
D1の公式接続経路、Turso/libSQLのDrizzle経路を比較する。新TursoエンジンのSDKへ同じadapterを流用しない。
認証表と業務表は同じ採用DBを第一案とし、認証操作だけが触れる表・列をサーバーで限定する。
認証のユーザー/アカウント/セッション/検証表、役割、抑止情報を公開APIやデータセットから除外する。
DB adapterの原子性を、登録・メール変更・回復・削除の部分失敗で試す。必要な保証がなければ採用しない。
根拠：[D1](https://better-auth.com/blog/1-5)、[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)、
[libSQL接続](https://orm.drizzle.team/docs/sqlite/connect-turso)。版は試作で選び固定する。

## 既存ID・確認状態・権限を変えない

既存の利用者UUIDを新認証のuser IDへ保持し、新規登録もUUIDを生成する。
登録日時・メール確認状態・Googleのproviderとsubjectを移し、同じメールだけを理由に別人を統合しない。
名前・画像等の公開プロフィールと、認証上のメール・役割を分離する。
登録日時を作り直すと、登録30分以内のオンボーディングと流入計測が誤るため同等性を試験する。
Googleの暗黙連携は無効化する案とし、追加連携はログイン済み本人による明示操作に限定する。
重複メール、未確認、停止/ban、MFAの実利用は実施前に照合し、未対応アカウントを通常利用者へ変換しない。

管理者は検証済みの `raw_app_meta_data.role = admin` をサーバー専用権限表へ明示変換する。
公式移行例の `is_super_admin` や `auth.users.role` だけで判定するとザリダスの管理者を引き継げない。
`user_metadata`は権限の元にせず、一般APIからrole・確認済み状態を書き換えられないようにする。
管理APIは現在の役割と失効状態をDBで確認する。クライアントの管理者表示は認可の代替にしない。
根拠：[現行auth](../../../docs/current/auth.md)、[移行例](https://better-auth.com/docs/guides/supabase-migration-guide)、
[連携](https://better-auth.com/docs/concepts/users-accounts)。

## パスワードを平文に戻さず移す

既存bcrypt hashと必要な属性を、承認した隔離環境の変換処理で移す。hashも認証秘密として暗号化し、Git/CIへ置かない。
公式例のNode `bcrypt` とPostgres向け取込み処理は、Workers/Turso/D1でそのまま動く前提にしない。
Workers対応verifier候補をworkerdで測り、合成した実cost相当のhashでCPU・メモリ・p95・並行ログインを試す。
Unicode・長文・bcryptの入力長の扱いも照合する。移行を通すためにhash強度を下げない。
新規/回復用のhash方式とcostも同じ実行環境で検証し、旧hashの検証と混在できる形式を定義する。
互換性を保証できない場合は、確認済み宛先への回復で再設定する案か管理サービスを選び直す。
パスワードの取得・メール送付はしない。[password方式](https://better-auth.com/docs/authentication/email-password)を参照する。

## 新認証の入口と既存画面を接続する

一般利用者の入口は既存AuthModalを維持する。`/api/auth/*` は認証handler、`/auth/callback` は完了/エラー案内として分担する。
AuthContextの利用者/読込中/管理者/確認状態と、ログアウト成否・未送信確認の契約を新SDKへ接続する。
SDKの生user型を広げず、UUID・登録日時・確認状態・信頼済み役割をアプリ用の型へ変換する。
メール登録・確認再送・回復・パスワード更新・メール変更とGoogle callbackを、用途ごとに接続し直す。
Googleの登録済みcallbackは新handler用を追加し、旧フローを止める時点まで旧URIも保持する。
登録/回復の応答から登録済みメールを判別させない。登録と回復で同じパスワード条件を使う。
本文だけでなく応答時間も測り、存在するメールだけ業者の送信完了を待つ分岐を作らない。
確認/回復は短命・一度限りとし、再送制限をサーバーで強制する。端末の3分表示だけで制限しない。
メール変更は最近の本人確認と旧/新アドレスの確認を条件とし、管理者の機微な操作にも再認証を要求する。

Supabase用の `captchaToken` 渡しは新入口へそのまま流用できない。Captcha pluginと操作別の検査を設計する。
登録・ログイン・回復・再送・内部API直呼びを対象表にし、サーバー呼出しでも制限が抜けないことを試す。
Turnstileのサーバー検証、信頼IPヘッダー、アカウント/IP単位の永続的な上限を使う。
Origin/CSRF検査とGoogle state/nonce/PKCE等は選定ライブラリの安全な方式を使い、callback/戻り先を許可リスト化する。
trusted originにpreview全体を広く許可しない。正規originとpreviewの鍵・DB・Cookieは分離する。
根拠：[Captcha](https://better-auth.com/docs/plugins/captcha)、[Rate limit](https://better-auth.com/docs/concepts/rate-limit)、
[Security](https://better-auth.com/docs/reference/security)、[Google](https://better-auth.com/docs/authentication/google)。

## セッションをDBで失効できるようにする

HttpOnly/Secure/SameSiteと適切なpathのCookieを使い、認証レスポンスは共有キャッシュへ入れない。
SSR/業務APIは新認証のサーバー検証を使う。Supabaseの `getSession()` 禁止を名前だけで別SDKへ移植しない。
管理・退会・権限変更はCookie cacheに頼らず、現在のsession/権限を照合する。
通常セッションは有効期限・更新・全端末失効の方針を固定し、回復/役割変更/退会後に古いCookieを拒否する。
内部ジョブは利用者sessionと分離したbinding/サービス認証にし、旧service-role keyを新認証の管理鍵として流用しない。
根拠：[Session管理](https://better-auth.com/docs/concepts/session-management)。

## 採用前の合格条件

既存UUID/登録日時/Google identity/確認状態/管理者権限が一致し、実ランタイムで全認証操作と失効を試験できること。
MFA等の実利用が見つかった場合は、その移植仕様と回復方法を追加してから切り替える。
認証DBの隔離復元、鍵紛失/漏えい時の復旧、更新追従の担当が定まり、[認証切替](auth-cutover.md)がリハーサル済みであること。
