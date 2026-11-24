## 背景

CI のチェック本数は多い（lint / type-check / i18n / schema / auth-route / build / unit / e2e / size-limit / Lighthouse / Deno test / rls-tests / schema-drift / audit / gitleaks）。しかし **アプリの中核フローと、外部へ送信する副作用を持つ Edge Function に限って、テストが空白**になっている。

### 問題A: e2e が主要フロー（投稿 → 審査 → 公開）を一切カバーしていない — High

`tests/e2e/` は 9 ファイル / 33 件で、全件を確認したところ**すべて未認証状態のスモークまたはガード確認**である。

| ファイル | 件数 | 内容 |
|---|---:|---|
| `lp.spec.ts` | 8 | LP の表示 |
| `survey-request.spec.ts` | 6 | 一覧描画・フィルタ UI・FAB → AuthModal |
| `auth.spec.ts` | 5 | 未ログインリダイレクト・AuthModal の開閉 |
| `post.spec.ts` | 4 | 下記 |
| `admin-guard.spec.ts` | 3 | 管理画面ガード |
| `admin-gemini-banner.spec.ts` | 3 | バナー表示 |
| `home.spec.ts` | 2 | ホーム描画 |
| `smoke.spec.ts` | 1 | スモーク |
| `error-boundary.spec.ts` | 1 | 404 ページ表示 |

`post.spec.ts` の 4 件は次のとおりで、**投稿の送信は一度も行われない**。

```
:21 未ログインでホームの「投稿」ボタンを押すと AuthModal が開く
:36 ホームページに BottomNav の主要タブが表示される
:48 未ログインでマイページタブを押すと AuthModal（login）が開く
:60 AuthModal を閉じてもホームの BottomNav が残る
```

原因は構成そのものにある。`playwright.config.ts:33-36` が webServer に placeholder を注入する。

```ts
env: {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
},
```

到達不能なホストを向いているため、**認証・DB を伴うフローは原理的に e2e で検証できない**。結果として、ザリダスの中核（投稿送信 → 管理者審査 → 公開／却下通知）に対する e2e は 0 件である。

`tests/e2e/error-boundary.spec.ts` は名前に反して 404 ページ表示の 1 件（`:6`）のみで、エラーバウンダリ自体を検証していない。なお `app/error.tsx` には unit テスト（`src/app/__tests__/error.test.tsx`）があるため**コンポーネント単体は検証済み**であり、空白なのは「実際に例外が起きたときに Next.js のエラーバウンダリが描画される」というブラウザ上の経路である。

