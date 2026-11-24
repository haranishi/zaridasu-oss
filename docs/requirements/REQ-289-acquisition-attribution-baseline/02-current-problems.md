## 現状の問題

### A. 🔴 `utm_content` が無く、クリエイティブ単位の分離ができない

`src/lib/shareUtm.ts:50-52`:

```ts
base.searchParams.set('utm_source', method)
base.searchParams.set('utm_medium', UTM_MEDIUM)
base.searchParams.set('utm_campaign', campaign)
```

フォールバック側（`:58`）も同じ 3 種のみ。`utm_content` を設定する経路が存在しない。

GA4 の慣習では `utm_source` = 媒体、`utm_campaign` = 施策、`utm_content` = **クリエイティブ / 投稿単位**の識別に使う。現状は「Instagram から来た」までは分かるが、「どの投稿から来たか」は分からない。マーケティング全体構造が想定する「勝ちパターンの特定」は `utm_content` 無しには成立しない。

なお `shareUtm` はアプリ内のシェア導線（`src/components/features/posts/LikeShareSection.tsx:85`）専用であり、**外部施策（IG 投稿・チラシ QR・ゲームからの送客）用の URL を生成する仕組みはそもそも存在しない**。

### B. 🟡 `from` パラメータにホワイトリストが無い

`/?auth=signup&from=<任意の値>` の値は、`src/views/HomePage.tsx:160-172` で読み取られ `sessionStorage`（キー `zaridasu:authFrom`）に `{v, t}` 形式で退避される。検証は無く、**任意の文字列がそのまま計測に入る**。

`src/components/modals/AuthModal.tsx:85-99`（`readAuthFrom`・TTL 30 分）→ `:312-318` で `trackEvent('sign_up_initiated', { method, from })`。最終 CV は `src/views/AuthCallbackPage.tsx:19-24` が読み取って削除する。

「ホワイトリスト無しで即使える」ことは施策開始のハードルが低いという利点だが、**表記ゆれ（`ig` / `instagram` / `Instagram`）が入ると集計時に分離できない**。台帳が無い状態で複数施策を走らせると、後から名寄せできない値が混ざる。

### C. 🟡 メール登録経路では `from` が失われる

`from` は `sessionStorage` に保持される。メール確認リンクは**別タブ／別アプリで開かれる**ことが多く、その場合 sessionStorage は引き継がれないため、`AuthCallbackPage` に到達した時点で `from` が読めない。

結果として、**メール登録の CV は流入元不明になりやすく、Google OAuth（同一タブで完結する）だけが確実に帰属する**。この非対称性を知らずに集計すると、OAuth 経路の施策が過大評価される。

### D. 🟡 計測は本番でしか発火せず、事前検証ができない

`src/lib/lpAnalytics.ts:36`:

```ts
if (process.env.NODE_ENV !== 'production') return
```

REQ-232 で送出口を `trackEvent` に一本化した際の共通ガード。開発環境・Vercel プレビューではイベントが飛ばないため、**計測の検証は本番でしか行えない**。パラメータの綴り間違いに気づくのが本番投入後になる。

### E. 🟡 `/lp` がアプリ内から到達不能

`/lp` はルートとして存在する（`src/app/lp/page.tsx`）が、アプリ内に遷移リンクが無い。実測では `src/components/layout/RootMain.tsx:27` のレイアウト判定と `page.tsx:18` の canonical 指定のみで、`href="/lp"` を持つコンポーネントは存在しない。

REQ-176 FR-176-12 / REQ-206 FR-206-08 が「SignupBanner から `/lp` への導線」を任意項目として TODO のまま管理している。REQ-284（紹介ストーリー）と目的が重なるため、両者の整理が要る。

### F. ベースラインの実測値が記録されていない

本番実測（2026-07-29）:

| 指標 | 値 |
|---|---:|
| `auth.users` | **9** |
| `posts` 総数 | **18** |
| うち `approved` | **12** |
| `push_subscriptions` | 0 |
| `lifecycle_email_log` | 0 |

※ 2026-07-28 にテスト投稿 33 件・調査依頼 2 件・通報 1 件を削除した**後**の値である。削除前の数値と混同しないこと。

これらは「施策開始前のゼロ点」として意味を持つが、どこにも確定値として記録されていない。

---
