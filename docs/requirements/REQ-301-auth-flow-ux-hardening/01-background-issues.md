### 問題A: 認証エラーの生英語メッセージがそのまま画面に出る — High

`src/components/modals/AuthModal.tsx:78-83` の `AUTH_ERROR_MAP` は4パターン（`Invalid login credentials` / `Email not confirmed` / `already registered` / `Password should be at least`）しか持たない。catch 節（:340-351）でマップに一致しなければ **`else { setError(msg) }`（:350）で Supabase の生メッセージをそのまま表示**する。

実際に露出する文言（いずれも英語のみ）:

- オフライン: **"Failed to fetch"**
- レート制限: "For security purposes, you can only request this after 60 seconds"
- メール形式エラー: "Unable to validate email address: invalid format"

`AuthModal` は `useOnlineStatus` も `getErrorMessage`（`errors.network` キーが4言語に存在する）も使っていない。日本語・韓国語・中国語 UI の利用者が「Failed to fetch」だけを見せられて何が起きたか分からず、リトライも接続確認もできないまま離脱する。認証は入口かつ投稿の必須条件なので、**離脱に直結する**。

### 問題B: `authLoading` を待たないため、ログイン済みユーザーに新規登録モーダルが出る — Medium

`src/views/HomePage.tsx:209-214`（`handlePostClick`）と :248-256（Header の `onSurveyClick`）は `user` のみで分岐し、`authLoading` を参照しない。

```
if (user) { …OPEN_POST_FORM } else dispatch({ type: 'OPEN_AUTH', tab: 'signup' })
```

同一ファイルの LP CTA effect（:173-174）は `if (!pendingAuthTab || authLoading) return` と**明示的に `authLoading` を待っている**。つまり待つべきという判断はこのファイル内で既に下されているのに、主要 CTA がそれを踏襲していない。

低速回線でセッション解決（`AuthContext` の `getSession`）が終わる前に「投稿する」をタップすると、**ログイン済みユーザーに新規登録モーダルが出る**。さらに `user` が後から確定してもモーダルを閉じる effect が無いため、開いたままになる。ユーザーは「ログインしていたのに登録させられる」と受け取る。

なお `pendingSurveyRequestSeed` の effect は user 確定後に自己回復する形になっているため、**同型の自己回復 effect を書けば解決できる**。

### 問題C: クライアント側バリデーションで CAPTCHA トークンを焼く — Medium

`src/components/modals/AuthModal.tsx` の `handleSubmit` は次の順で処理する。

1. :258 `if (loading) return`（REQ-223 の同期ガード）
2. :262 `const captchaToken = captchaEnabled ? captchaTokenRef.current : undefined`／:263-266 未取得なら `auth.errors.captchaRequired` で return
3. :268 `const captchaOpts = captchaToken ? { captchaToken } : {}`
4. :283-286 パスワード不一致なら `setError(t('auth.errors.passwordMismatch'))` して **return**
5. :288-291 強度不足なら `setError(t(strength.messageKey!))` して **return**
6. :352-358 `finally` で成否に関わらず `setCaptchaReady(false)` ＋ `resetCaptcha()`

**検証（4・5）がトークン取得（2）より後**にあり、しかも `finally`（6）は return 経路でも実行される。つまりパスワード確認欄を打ち間違えると、その1回で Turnstile トークンが消費・リセットされる。ユーザーが誤りを直して即座に再送信すると :263-266 のガードに掛かり、**「CAPTCHAを完了してください」**が出る。

Turnstile の再チャレンジには数秒かかり、低速回線では十数秒に達する。登録ファネルの最後で理由の分からない足止めが起きるため、離脱要因になる。

### 問題D: 認証コールバックで URL 由来の任意文字列を正規UIに表示できる — Low（security S-6）

`src/views/AuthCallbackPage.tsx:50-59`。`error_code` が付いていて `otp_expired` **以外**の場合、:58 で `setError(errorDescription ? decodeURIComponent(errorDescription) : t('authCallback.errors.authFailed'))` とし、:152 の `<p>{error}</p>` に表示する。

**JSX のエスケープが効くので XSS は成立しない**（そこは健全）。しかし攻撃者は

```
https://zaridasu.com/auth/callback#error_code=x&error_description=<任意の日本語文>
```

というリンクを配ることで、**正規ドメイン・正規 UI・正規の見た目のまま任意の文章を表示できる**。「アカウントが凍結されました。下記に連絡してください」といったフィッシング／サポート詐欺の土台になる。`error_code` は任意値を取れるため、`otp_expired` 以外はすべてこの分岐に入る。

### 問題E: 二重送信の同期ガード適用漏れ — Low

`src/components/modals/EditProfileModal.tsx:85-105`（`handleSave`）と `src/components/modals/ReportModal.tsx:45-49`（`handleSubmit`）は冒頭の同期ガードを持たず `disabled` のみに依存する。REQ-223 FR-223-08 は「`disabled={loading}` は state 反映前の連打にわずかな隙があるため、処理中ならハンドラ先頭で同期 return する」と定めており、`AuthModal.tsx:258` / `SurveyRequestForm.tsx:78` / `PostForm` には適用済みなので**非対称**である。
