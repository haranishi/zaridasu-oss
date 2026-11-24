# アカウントと認証 — いまの仕様

> 「いま何が正しいか」だけを書く。「そのとき何を変えたか」は `docs/requirements/REQ-*.md`（履歴）。
> 食い違ったら**コードが正**。

## ログインの手段

- **Google でログイン**（OAuth）
- **メールアドレスとパスワード**

CAPTCHA（Turnstile）を通す。実装は `src/components/modals/AuthModal.tsx`。

**アプリ内から `/auth` ページへ直接遷移しない。** ログイン導線は `AuthModal` に一本化してある。復活していないかを `npm run auth-route:check` が機械的に見張る。

**登録・ログインのあとは、ホーム（`/`）に戻る。** メール確認が済んだら3秒後にホームへ移る（以前はマイページ）。Googleもホーム。モーダルでのログインは、開いていた画面のまま。投稿画面を自動で開く処理は無い（2026-10-19、本人の指定）。新規登録の画面には「記録するには、無料の登録が必要です」と、利用規約・プライバシーへのリンクを置く。

## サーバー側で `getSession()` を認可に使わない

**`getSession()` は Cookie をそのまま返すだけで、Auth サーバーで再検証しない。** Cookie を偽装されると戻り値も偽装され得る。

サーバー側（SSR / Server Component / Server Action / Route Handler / middleware）では **`getUser()`（Auth サーバー検証）か `getClaims()`（JWT 署名検証）**を使う。

ESLint が `no-restricted-syntax` で止める。正規の利用は `src/context/AuthContext.tsx`（クライアント表示用）だけ。

## 管理者

**`app_metadata.role === 'admin'` の人**。判定の詳細は [moderation.md](./moderation.md#管理者とは)。

**`user_metadata` と間違えないこと。** あちらは本人が書き換えられる。

## オンボーディング

ログイン中で `user_onboarding` に行が無い人に、4 画面のオンボーディングを出す。`OnboardingGate` が `providers.tsx` から常時判定している。

**必須かどうかは「登録直後かどうか」で変わる。** `user.created_at` から 30 分以内なら必須で、離脱口は最後の画面だけ。それより前に登録した既存会員には 1 画面目から「あとで」が出る。判定は `src/lib/onboarding/index.ts` の `isFreshSignup`。

**「あとで」で閉じても `user_onboarding` に行は作らない。** 次回また出る。閉じ込めないだけで回答は諦めていない。

**管理画面（`/admin` 配下）と認証画面（`/auth` 配下）では出さない。** 審査作業・メール確認・パスワード再設定を遮らず、認証後の画面で案内する。

**保存に 2 回失敗したら「あとで」を出して閉じ込めない。** 保存できないせいでアプリが使えなくなる方が損害が大きい。

回答（居住地域・目撃経験）は `user_profiles` ではなく **`user_onboarding` に own-row RLS で保存する**。理由は [privacy.md](./privacy.md#公開プロフィール)。

未ログインの人には任意モード（`useIntroStory` / `IntroPrompt` / opt-out）が出る。**選んだ地域をこの端末の `localStorage` に保存する**。目撃経験はその場の説明の切り替えだけに使い、プロフィールには入らない。

2〜4画面目では「戻る」で回答を保持したまま修正できる。保存中は戻る・閉じる・二重保存を止め、失敗時は押した側のボタン（地図／投稿）で再試行する。

**「地図を見る」は別ページから開いてもホームへ進む。** 任意モードの1画面目では回答を保存せず進む。最終画面では保存してから進む。
「投稿してみる」はホームの投稿導線へ引き継ぐ。未ログインでは先に登録モーダルを出す。模式図は実際の地域の地図と区別して表示する。

## プロフィール

`user_profiles` は本人だけが作成・更新でき、**`is_public = true` にすると全列が誰にでも読める**。列を足すときは [privacy.md](./privacy.md#公開プロフィール) を読むこと。

## Site URL の設定に注意

Supabase の Auth 設定にある Site URL に**先頭スペースが入ると、Google OAuth のコールバックが全部 500 になる**（GoTrue の URL パースが失敗する）。2026-08-09 に実際に起きた。ダッシュボードに URL を貼るときは前後の空白を確認すること。

設定は Management API の `/v1/projects/{ref}/config/auth` からも読み書きできる。

## 関連

- 管理者の権限 — [moderation.md](./moderation.md)
- 個人情報の扱い — [privacy.md](./privacy.md)
- 履歴 — REQ-214（getSession 禁止）・REQ-301（認証フローの UX）・REQ-325（オンボーディング）・REQ-326（既存会員のスキップ）・REQ-327（画面数と記号の整合）・[REQ-328](../requirements/REQ-328-onboarding-wayfinding.md)（回答修正と地図への導線）
