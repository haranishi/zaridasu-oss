# 認証・セッションと利用者の切り替え

基点：`6070714870e5`。守る仕様の正本は [auth](../current/auth.md)・[privacy](../current/privacy.md)。初回案内は [別ページ](authentication-onboarding.md)。

## 認証の入口から復帰まで

1. 投稿・マイページ・LPなどの操作元が [AuthModal](../../src/components/modals/AuthModal.tsx) を開く。一般利用者向けの独立 `/auth` ページへは送らない。
2. モーダルがログイン／登録／再設定を切り替え、Supabase Authへ渡す。メール認証の成功はモーダル内で示す。
3. Googleは [signInWithGoogle](../../src/lib/auth/google.ts) から同じoriginの `/auth/callback` へ戻す。
4. [AuthCallbackPage](../../src/views/AuthCallbackPage.tsx) が確認完了・パスワード回復・OAuth復帰・期限切れを分け、ホームまたはマイページへ送る。

モーダルのエラー翻訳は既存文言のマッピング、パスワード条件は [password](../../src/lib/validation/password.ts) が受け持つ。
登録と回復で同じ強度検証を使う。登録済みメールを調べる事前RPCには依存しない。
確認メールの再送は [useEmailResend](../../src/hooks/useEmailResend.ts) に集約し、3分のクールダウンを端末に保存する。
初回SSRとhydrationは残秒0で揃え、保存済み期限はマウント後に読む。保存できない端末でも当該画面の再送を扱える。

## CAPTCHAの意味

AuthModalは公開site keyがある場合だけTurnstileを読み込み、メール操作に取得tokenを渡す。
設定済みでtokenが無い・期限切れ・描画失敗の場合はメールフォームを送らない。試行後はtokenをリセットする。
site key未設定ならウィジェットと検査を省略する。実際の強制にはSupabase Auth側の設定も必要。
Google OAuthは別の認証呼び出しであり、メールフォームのtoken検査がそのまま通る経路ではない。
本番設定の手順は [CAPTCHA設定](../security/captcha-setup.md) を参照する。環境が設定済みかはソースだけから断定しない。

## AuthContextが共有するもの

[AuthProvider](../../src/context/AuthContext.tsx) は起動時のsession取得とauthイベント購読を行い、利用者・読込中・管理者表示・メール確認状態を供給する。
同じID・確認時刻・`app_metadata.role` のイベントではuser参照を維持する。token更新のたびに全消費画面を再取得させないため。
管理者表示は `app_metadata.role` を使い、本人が変更できる `user_metadata` とは区別する。
clientの `getSession()` は表示状態の初期化に使う。サーバー認可は [Supabase境界](authorization.md) の検証済み利用者とDB権限で成立させる。

プロフィール取得・地域回答・非公開地点などのhookは利用者IDに従う。認証の復元中を「未ログイン確定」とみなさない。
ホームのLP認証クエリはauth復元を待ってから開く。ログイン済みなら通常のホームに戻す。
Providersはルートへ誤着地した回復／エラーリンクをcallbackへ送り、手続きを先に終えられるようにする。

## ログアウトと退会

`signOut()` は成否のbooleanを返す。送信待ちの計画記録や圏外投稿があれば、送って出る／破棄して出る／やめるを提示する。
確認中の呼び出しは同じPromiseを返し、二重に確認や送信を始めない。
AuthへのsignOutでエラーが返ったらsessionの残存も調べる。成功時にだけ利用者の計画控えと入力下書きを消す。
破棄もログアウト成功後に行う。圏外でログインが残ったまま送信待ちだけを失うことを避けるため。
別タブや期限切れによる `SIGNED_OUT` も、前の利用者の端末控えを掃除する。[オフライン保存](offline.md)

`deleteAccount()` は希少種・水域報告の非公開写真をStorageから消し、`delete_own_account` RPCを呼ぶ。
写真削除に失敗したら退会を止める。写真削除後にRPCが失敗した場合は、その部分成功を区別して表示する。
退会成功後は利用者別キュー・控え・下書きを消す。DBのCASCADEだけでStorage実体が消えるとは扱わない。[データ](data-model.md)
[DashboardPage](../../src/views/DashboardPage.tsx) は確認語入力を求める退会UIを持つ。
管理者の無操作タイムアウトは別経路なので [管理画面](frontend-admin.md) を参照する。

## 流入情報と変更箇所

LPなどの `auth`・`from` クエリはホームで消し、帰属だけをsessionStorageへ退避する。
[acquisition](../../src/lib/acquisition.ts) の許可値と30分TTLに従い、callbackの登録完了時に消費して消す。
同じタブでのOAuth往復には残るが、別タブ・別端末の確認リンクでは共有されない。この場合の帰属復元を保証しない。
記録するイベントと共有URLは [公開ページ・計測](localization-ui-seo.md) を参照する。

ログイン項目・エラーはAuthModal、復帰先はAuthCallbackPage、共有sessionと終了処理はAuthContextが変更箇所。
[AuthModalテスト](../../src/components/modals/__tests__/AuthModal.test.tsx)、[callbackテスト](../../src/views/__tests__/AuthCallbackPage.test.tsx)、[AuthContextテスト](../../src/context/__tests__/AuthContext.test.tsx)、[終了処理テスト](../../src/context/__tests__/AuthContext.signOut.test.tsx) を照合する。
一般認証導線の検査は `npm run auth-route:check`。DBの本人性と権限検査は [検証案内](validation.md) に従う。
