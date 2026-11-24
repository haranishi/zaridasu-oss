# REQ-209: コード品質クリーンアップバンドル（重複実装・デッドコード・型の並行定義の整理）

## 背景
ザリダス (Next.js 15 + Supabase) は機能追加を重ねる過程で、同じ目的のロジック・定数・型が複数箇所に並行して実装され、また過去 REQ で「削除指定」だったコードがリネームで温存される、といった負債が蓄積している。いずれも単体ではバグではないが、DRY 違反・デッドコードは保守時の誤読・二重修正漏れ・「防御したつもりが効いていない」状態を生む。対応箇所は独立しているため 1 つの REQ にまとめ、**FR を課題ごとに分けて**記述する。

実コードを確認した上での現状は以下の通り。

## 現状の問題
（ファイルパス:行番号つき）

### 1. メール再送クールダウンの二重実装（localStorage 版 vs インライン state 版）
- `src/hooks/useEmailResend.ts`（localStorage 永続版）: クールダウンを `localStorage[COOLDOWN_KEY]`（`:5,:21-23,:40`）で保持し、成功/失敗メッセージを**日本語直書き**（`:42` "確認メールを再送信しました…"、`:44` "再送信に失敗しました…"）で返す。`CommentSection.tsx:46` 等で使用。
- `src/components/modals/AuthModal.tsx` のインライン版: 同じ再送を `resendCooldownUntil` state（`:40-42`）＋ `setInterval`（`:53-61`）＋ `handleResend`（`:90-105`）で独自実装し、メッセージは i18n（`t('auth.emailResent')` 等）で出す。
- 同一機能が「localStorage 永続 / ja 直書き」と「state ベース / i18n 対応」に分岐しており、文言・永続化・クールダウン挙動が乖離している。

### 2. `formInputCls` 同一文字列のインライン重複と admin の PAGE_SIZE 重複定義
- 入力クラス文字列 `w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors ...` が `src/lib/formStyles.ts:7` の `formInputCls(dark)` と**同一**なのに、`src/components/modals/AuthModal.tsx:213`・`src/components/modals/SurveyRequestForm.tsx:79`・`src/views/AuthCallbackPage.tsx:167,185` の 4 箇所でインラインに再掲されている（`formInputCls` を使っていない）。
- admin 3 ページが各自 `const PAGE_SIZE = 20` を定義: `src/views/admin/AdminLogsPage.tsx:8`・`src/views/admin/AdminPostsPage.tsx:20`・`src/views/admin/AdminCommentsPage.tsx:12`。一方 `src/lib/constants.ts:67` には `PAGE_SIZE = 50`（一覧用）があり、**同名で値が違う**ため紛らわしい。

### 3. date-fns ロケールマップの重複（getDateLocale 不使用）
`src/lib/dateLocales.ts:7-11` に `DATE_LOCALES` / `getDateLocale(lang)` があるのに、`src/hooks/useDetailSEO.ts:10-15`（`DATE_FNS_LOCALES`）と `src/components/features/posts/CommentSection.tsx:19`（`DATE_LOCALES`）が ja/en/zh/ko の同じマップを**それぞれ再実装**している。

### 4. `useDetailSEO` の並行型定義と無意味なキャスト
`src/hooks/useDetailSEO.ts:17-28` が `SpeciesEntry` / `InfoTypeEntry` をローカル定義しているが、`src/lib/constants.ts:69-88` には `SpeciesOption` / `InfoTypeOption` が export 済みで import していない。その結果 `:61-62` で `(SPECIES as unknown as SpeciesEntry[])` / `(INFO_TYPES as unknown as InfoTypeEntry[])` の二段キャスト、`:107-108` で `(species as SpeciesEntry & { scientific?: string })` の重ねキャストが発生している。また `src/views/DetailPage.tsx:112` の `const { comments, likes, ...postRest } = data as unknown as DetailPost & {...}` には、REQ-155 形式の「なぜ二段キャストが必要か」の理由コメントが付いていない。

### 5. REQ-102 指定のデッドコードが `_` リネームで温存
`src/app/(home)/HomeInteractive.tsx` に、REQ-102 で整理対象だったはずのコードが `_` プレフィックスのまま残存：
- `:102` `const { t: _t } = useTranslation()` — 値は未使用だが `useTranslation()` の購読は生きており、言語切替時に当該コンポーネントが**不要に再レンダー**される。
- `:106` 分割代入 `activeTab: _activeTab`（未使用）。
- `activeTab` 関連の reducer 一式: 初期 state（`:45,:54`）、アクション型 `SET_ACTIVE_TAB`（`:67`）、reducer case（`:86-87`）。**`dispatch({ type: 'SET_ACTIVE_TAB' })` の呼び出しはコード中に 1 件も無い**（grep で 0 件）ため、`activeTab` state とそのアクションは完全に死んでいる。

### 6. 旧テスト基盤の残骸
`src/test/setup.js`・`src/test/mocks/auth.js`・`src/test/mocks/supabase.js` が存在するが、`vitest.config.ts:7` の `setupFiles` は `['./vitest.setup.ts']` のみで**これらを参照していない**（`src/test/` 配下は現行テスト構成から切り離されている）。`eslint.config.js:107` のテスト用設定ブロックの glob（`'src/test/**/*.{js,jsx,ts,tsx}'`）はこの残骸ディレクトリを前提にしている。

### 7. GTM dataLayer の型二重宣言と push 実装の分散
- `Window.dataLayer` 型が `src/types/gtm.d.ts:2`（`Record<string, unknown>[]`）と `src/components/common/WebVitalsReporter.tsx:6-10`（`Array<Record<string, unknown>>`）で**二重宣言**。
- `dataLayer.push` の実装が 3 流派: `src/lib/lpAnalytics.ts:8-13` と `WebVitalsReporter.tsx:12-27` は `process.env.NODE_ENV !== 'production'` の**ガード有**、`src/components/modals/AuthModal.tsx:130,173` と `src/views/AuthCallbackPage.tsx:53,64,76` は**ガード無し（無条件 push）**。production 限定の方針が箇所により不揃い。

### 8. providers.tsx の rAF コールバック内 return が死にコード
`src/app/providers.tsx:46-53` の `useEffect` が
```ts
requestAnimationFrame(() => {
  setFadeOut(true)
  const removeTimer = setTimeout(() => setLoading(false), 400)
  return () => clearTimeout(removeTimer)   // ← rAF コールバックの戻り値は破棄される
})
```
となっており、`return () => clearTimeout(removeTimer)` は **rAF コールバックの戻り値**であって React の `useEffect` クリーンアップとして登録されない。アンマウント時に `removeTimer` がクリアされず、クリーンアップとして機能していない死にコード。

### 9. `rpcThrottle.ts` の throttleRpc が完全未使用（防御が効いていない）
`src/lib/rpcThrottle.ts:12-26` の `throttleRpc`（ヘッダコメントに「FR-004: RPC 呼び出しのスロットリング」）は、`export` されているが**アプリ・テストを含めどこからも import されていない**（`grep` で定義 2 件以外の参照 0 件、`.test.ts` からの import も 0 件）。「RPC スロットリング」という防御の意図が、実際にはどの RPC 呼び出しにも適用されていない。

## 目的
- 重複実装・並行型定義を単一の出所（共有フック / 定数 / ユーティリティ / 型）へ集約し、二重修正漏れと挙動乖離を無くす。
- デッドコード（未使用 state / reducer / 旧テスト残骸 / 効いていないクリーンアップ / 未使用の防御関数）を除去し、コードの意図と実態を一致させる。
- GTM 計測の型と送出ガードを 1 本化する。

## 要件
### 機能要件
- [ ] FR-209-01: メール再送クールダウンを `useEmailResend` に一本化する。`src/hooks/useEmailResend.ts` を**メッセージを i18n キー（または翻訳済み文字列）で返す**形に改修し（`:42-44` の ja 直書きを廃止）、`src/components/modals/AuthModal.tsx` のインライン再送実装（`:40-42,:53-61,:90-105`）を当該フックへ統合する。永続化方針（localStorage か state か）はどちらかに統一する。※ AuthModal は SSR 関連の REQ-178 修正と同時に着手すると干渉が少なく効率的。
- [ ] FR-209-02: 入力クラスと admin ページサイズの重複を集約する。`AuthModal.tsx:213`・`SurveyRequestForm.tsx:79`・`AuthCallbackPage.tsx:167,185` のインライン入力クラスを `formInputCls(dark)`（`src/lib/formStyles.ts`）の呼び出しに置換する。admin の `PAGE_SIZE = 20`（`AdminLogsPage.tsx:8`・`AdminPostsPage.tsx:20`・`AdminCommentsPage.tsx:12`）を `src/lib/constants.ts` に `ADMIN_PAGE_SIZE` として 1 箇所定義し、3 ページから参照する（既存の一覧用 `PAGE_SIZE = 50` と名前で区別する）。
- [ ] FR-209-03: date-fns ロケールマップを `src/lib/dateLocales.ts` の `getDateLocale` に統一する。`useDetailSEO.ts:10-15`（`DATE_FNS_LOCALES`）と `CommentSection.tsx:19`（`DATE_LOCALES`）のローカル再実装を削除し、`getDateLocale(i18n.language)` を使う。
- [ ] FR-209-04: `useDetailSEO` の型を集約しキャストを減らす。`useDetailSEO.ts:17-28` のローカル `SpeciesEntry` / `InfoTypeEntry` を `constants.ts` の `SpeciesOption` / `InfoTypeOption` の import に置換し、`:61-62` / `:107-108` の `as unknown as` 二段キャストを解消する。`DetailPage.tsx:112` の `as unknown as` には REQ-155 形式で「なぜ必要か」の理由コメントを付与する（または PostgREST embed 型を定義してキャストを外す）。
- [ ] FR-209-05: `HomeInteractive.tsx` の未使用コードを削除する。`:102` の `const { t: _t } = useTranslation()`（不要再レンダー源）、`:106` の `activeTab: _activeTab`、`activeTab` の初期 state（`:45,:54`）、アクション型 `SET_ACTIVE_TAB`（`:67`）、reducer case（`:86-87`）を、dispatch 箇所が無いことを確認の上まとめて除去する。
- [ ] FR-209-06: 旧テスト基盤の残骸を削除する。`src/test/setup.js`・`src/test/mocks/auth.js`・`src/test/mocks/supabase.js` が現行 `vitest.config.ts:7`（`setupFiles: ['./vitest.setup.ts']`）から未参照であることを確認し削除する。あわせて `eslint.config.js:107` のテスト用 glob から `src/test/**/*` を除去（または現行のテスト配置 `src/**/__tests__/**` のみに整理）する。
- [ ] FR-209-07: GTM dataLayer を 1 本化する。`Window.dataLayer` の型宣言を `src/types/gtm.d.ts` に一本化し、`WebVitalsReporter.tsx:6-10` の重複 `declare global` を削除する。`dataLayer.push` を `pushGtmEvent(event, params)` ヘルパー（production ガードを内包）に集約し、`AuthModal.tsx:130,173` / `AuthCallbackPage.tsx:53,64,76`（無条件 push）と `lpAnalytics.ts` / `WebVitalsReporter.tsx`（ガード有）を同ヘルパー経由に統一する。※ REQ-182 のコンバージョン計測修正と連動させる。
- [ ] FR-209-08: `providers.tsx:46-53` の死にクリーンアップを正す。rAF コールバック内の `return () => clearTimeout(removeTimer)` を、`useEffect` 本体が返すクリーンアップとして登録される形（rAF ハンドルと timer の両方を `useEffect` の return で `cancelAnimationFrame` / `clearTimeout` する）に書き換える。
- [ ] FR-209-09: `src/lib/rpcThrottle.ts` の方針を決定し反映する。**(a) 適用案**: スロットリングが必要な RPC（例: 連打されうる `respond` / `like` / 集計 RPC）を特定し `throttleRpc` を実際に適用してテストを追加する、**(b) 削除案**: 不要と判断し `rpcThrottle.ts`（および参照する `clearThrottleCache` テスト等があれば）をファイルごと削除する。本 FR では (a)/(b) いずれを採るかの判断と実施を成果物とする（未使用の防御関数を放置しない）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-209-01: FR-209-01 / 07 で文言を変更・追加する場合は ja/en/ko/zh の 4 ロケールを整合させ、`npm run i18n:check` を満たすこと。
- [ ] NFR-209-02: 各リファクタはリグレッションを伴わないこと（メール再送・admin ページング・日付表示・SEO メタ・GTM 計測・ローディング画面の挙動が従来どおり）。
- [ ] NFR-209-03: 削除・集約後に `tsc --noEmit` / `npm run lint`（`--max-warnings 0`）/ `next build` / `vitest run` が成功すること。`@typescript-eslint/no-unused-vars` が `_` プレフィックス頼みでなく素の状態で通ること。

## 受入条件
- [ ] AC-01: メール再送が単一実装（`useEmailResend`）に集約され、AuthModal / CommentSection が同じフックを使い、文言が i18n から供給される。
- [ ] AC-02: `formInputCls` のインライン重複 4 箇所が共有関数呼び出しに置換され、admin 3 ページが `ADMIN_PAGE_SIZE` を参照する（`grep` で重複定義が消えている）。
- [ ] AC-03: `useDetailSEO` / `CommentSection` のローカル date-fns ロケールマップが消え、`getDateLocale` を使用している。
- [ ] AC-04: `useDetailSEO` が `SpeciesOption` / `InfoTypeOption` を import し、`as unknown as` 二段キャストが解消されている。`DetailPage.tsx:112` のキャストに理由コメントが付く（または型定義でキャスト不要化）。
- [ ] AC-05: `HomeInteractive.tsx` に `_t` / `_activeTab` / `SET_ACTIVE_TAB` / `activeTab` state が存在しない。
- [ ] AC-06: `src/test/setup.js` / `src/test/mocks/*` が削除され、`eslint.config.js` の glob が現行テスト配置に整理されている。`vitest run` が通る。
- [ ] AC-07: `Window.dataLayer` の型宣言が 1 箇所のみで、すべての `dataLayer.push` が production ガード付きヘルパー経由になっている。
- [ ] AC-08: `providers.tsx` のローディング用 `useEffect` がアンマウント時に rAF / timer を正しくクリーンアップする。
- [ ] AC-09: `rpcThrottle.ts` が実際の RPC に適用されている（適用案）か、リポジトリから削除されている（削除案）。未使用の `export` が残っていない。
- [ ] AC-10: `tsc --noEmit` / lint / `next build` / `vitest run` / `i18n:check` がすべて成功する。

## 影響範囲
- `src/hooks/useEmailResend.ts` / `src/components/modals/AuthModal.tsx` / `src/components/features/posts/CommentSection.tsx`（再送・date-fns）
- `src/components/modals/SurveyRequestForm.tsx` / `src/views/AuthCallbackPage.tsx`（formInputCls・dataLayer）
- `src/views/admin/{AdminLogsPage,AdminPostsPage,AdminCommentsPage}.tsx` / `src/lib/constants.ts`（ADMIN_PAGE_SIZE）
- `src/hooks/useDetailSEO.ts` / `src/views/DetailPage.tsx`（型集約・キャスト）
- `src/app/(home)/HomeInteractive.tsx`（デッドコード）
- `src/test/**` / `vitest.config.ts` / `eslint.config.js`（旧テスト残骸）
- `src/types/gtm.d.ts` / `src/components/common/WebVitalsReporter.tsx` / `src/lib/lpAnalytics.ts`（GTM 型・push）
- `src/app/providers.tsx`（rAF クリーンアップ）
- `src/lib/rpcThrottle.ts`（適用 or 削除）

## 優先度
- **緊急度**: Low / **重要度**: Low〜Medium / **理由**: いずれも現状の機能は動作しており即時のバグではないが、(1)(2)(3)(4)(7) の重複は二重修正漏れ・挙動乖離の温床、(5)(6)(8)(9) のデッドコードは「効いていない防御 / 不要再レンダー / 機能しないクリーンアップ」を含み、誤読と無駄を生む。まとめて整理することで保守性・一貫性が上がり、関連 REQ（178 の SSR、182 の CV 計測）と同時に着手すると効率が良い。
