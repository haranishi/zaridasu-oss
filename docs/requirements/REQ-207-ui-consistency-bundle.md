# REQ-207: UI 一貫性バンドル（ReportModal ダークモード・破壊的操作の確認UX統一・誤絵文字・AuthModal タブ a11y）

## 背景
ザリダス (Next.js 15 App Router) はダークモード・多言語・a11y を全体方針として揃えてきたが、後追いで追加された一部のモーダル・確認操作・絵文字・タブに、既存パターンから外れた実装が残っている。いずれもユーザーに直接見える一貫性の欠如（白画面・確認体験のばらつき・誤った種アイコン・スクリーンリーダー非対応）であり、対応箇所はそれぞれ独立しているため 1 つの REQ にまとめ、FR を課題ごとに分けて扱う。

実コードを確認した上での現状は以下の通り。

## 現状の問題
（ファイルパス:行番号つき）

### 1. ReportModal がダークモード非対応（ダーク環境で真っ白になる）
`src/components/modals/ReportModal.tsx:72-135` は、ユーザー向けモーダルの中で**唯一 `dark:` クラスを一切持たない**（当該ファイル内 `dark` の出現 0 件）。コンテナ `:72` が `bg-white`、見出し `:74` が `text-gray-800`、ラベル・本文・入力・ボタンがすべて light 配色固定。投稿詳細（CommentSection 等はダーク対応済み）をダークモードで開いてから通報モーダルを開くと、白背景＋薄いグレー文字でコントラストが破綻し、ほぼ真っ白に見える。比較対象として `src/components/modals/AuthModal.tsx` は `useTheme()` の `dark` でダーク配色を出し分けており、`formStyles` 系（`formInputCls` 等）も dark 対応を内包している。

### 2. 破壊的操作（削除）の確認 UX が 3 方式で混在
同じ「削除」操作なのに確認体験がバラバラ：
- **確認なしで即削除**: 投稿コメント削除はゴミ箱アイコンのタップで即実行。`src/components/features/posts/CommentSection.tsx:151-158` のボタンが `onClick={() => handleDelete(comment.id)}` を直接呼び、`handleDelete`（`:107-112`）は確認なしで楽観的削除する。
- **`window.confirm` の日本語直書き**: 調査依頼コメント削除は `src/views/SurveyRequestPage.tsx:347` で `if (!window.confirm('このコメントを削除しますか？')) return`（ブラウザ標準ダイアログ・文言ハードコード・i18n 非対応）。
- **カスタム確認 UI**: 投稿削除は `src/components/modals/DeleteDialog.tsx`（モーダル型、`deleting` prop でボタン無効化、i18n 済み）、下書き削除は `src/components/features/dashboard/PendingPostsSection.tsx:124-139` のインライン確認（削除/キャンセルの 2 ボタンに切り替わる方式）。

3 方式が混在し、ユーザーは操作対象によって「即消える / OS ダイアログ / インライン確認」と体験が変わる。最低限、誤タップで即消える CommentSection の確認欠如と、`window.confirm` 直書きは是正が必要。

### 3. ウシガエルの関連投稿に誤って 🦞（ザリガニ）絵文字が出る
`src/views/SurveyRequestPage.tsx:234` の関連投稿リストで種アイコンを
```tsx
<span>{SURVEY_SPECIES.find(s => s.value === post.species)?.image ? '🦞' : '🐸'}</span>
```
と決めている。`SURVEY_SPECIES`（`src/lib/constants.ts:218-221`）は `[...SPECIES, { value:'unknown', image:null }]` であり、`SPECIES`（`constants.ts:77-80`）は **american も bullfrog も `image` を持つ**（`/images/american.png` / `/images/bullfrog.png`）。そのため `?.image` は両種で truthy になり、**ウシガエル（bullfrog）でも常に 🦞 が表示**される。`SPECIES` / `SURVEY_SPECIES` には正しい `emoji` フィールド（`constants.ts:74`・`:215`。american=🦞相当 `🦞`、bullfrog=🐸 `🐸`）があるのに未使用。

### 4. AuthModal のタブがスクリーンリーダー非対応（role/aria 欠如）
`src/components/modals/AuthModal.tsx:257-269` のログイン/新規登録/リセット切替タブは、単なる `<button>` の並びで `role="tablist"` / `role="tab"` / `aria-selected` を持たない。同アプリの `src/views/RankingPage.tsx:88-110` は同種のタブ切替を `role="tablist"`・`role="tab"`・`aria-selected={...}` で正しくマークアップしており、実装が不統一。AuthModal のタブはスクリーンリーダーで「タブ群」として認識されず、現在選択中のタブも読み上げられない。

## 目的
- ユーザー向けモーダル・操作の見た目と挙動を既存パターンに合わせ、ダーク表示・確認体験・種アイコン・支援技術対応の一貫性を回復する。

## 要件
### 機能要件
- [ ] FR-207-01: `ReportModal`（`src/components/modals/ReportModal.tsx:72-135`）をダークモード対応にする。`useTheme()` の `dark`（または `formStyles` のダーク対応ユーティリティ／`formInputCls`）を用い、コンテナ背景・見出し・ラベル・ラジオ・テキストエリア・各ボタンに `dark:` 配色を付け、他モーダル（AuthModal 等）と統一する。入力クラスは可能な限り共有スタイルを流用する。
- [ ] FR-207-02: 投稿コメント削除の確認を追加する。`src/components/features/posts/CommentSection.tsx:151-158` のゴミ箱タップで即削除しないよう、インライン確認方式（削除/キャンセルに切り替わる、`PendingPostsSection` と同型）を導入する。確認文言は i18n キーで提供する。
- [ ] FR-207-03: 調査依頼コメント削除の `window.confirm` を廃止する。`src/views/SurveyRequestPage.tsx:347` の `window.confirm('このコメントを削除しますか？')` を、FR-207-02 と同じインライン確認方式へ置換し、文言をハードコードから i18n キーに移す。
- [ ] FR-207-04: 破壊的操作の確認方式をインライン確認に寄せて統一する。少なくともコメント削除（投稿・調査依頼）はインライン確認で揃え、投稿/下書き削除の既存挙動（`DeleteDialog` / `PendingPostsSection`）と整合させる。新規に追加する確認文言は 4 ロケールに追加する。
- [ ] FR-207-05: `src/views/SurveyRequestPage.tsx:234` の種アイコンを `SURVEY_SPECIES.find(s => s.value === post.species)?.emoji`（存在しない場合の既定値つき）に置換し、bullfrog で 🐸、american で 🦞 と正しく表示されるようにする。`?.image` による真偽判定を廃止する。
- [ ] FR-207-06: `AuthModal` のタブ（`src/components/modals/AuthModal.tsx:257-269`）を `RankingPage.tsx:88-110` と同パターンに統一する。タブ群コンテナに `role="tablist"`（`aria-label` つき）、各タブに `role="tab"` と `aria-selected={tab === tb.id}` を付与し、対応するパネルとの関連付け（`aria-controls` / `id`）を可能な範囲で行う。

### 非機能要件（該当する場合のみ）
- [ ] NFR-207-01: FR-207-02〜04 で追加する確認文言・FR-207-06 のラベルは ja/en/ko/zh の 4 ロケールに追加し、`npm run i18n:check` を満たすこと。
- [ ] NFR-207-02: ダークモード対応・タブ a11y 化により、既存のフォーカストラップ（`useFocusTrap`）・Escape クローズ（`useEscapeKey`）の挙動を壊さないこと。
- [ ] NFR-207-03: 確認方式の統一でリグレッション（削除が実行されない／二重実行される）を起こさないこと。

## 受入条件
- [ ] AC-01: ダークモードで投稿詳細から通報モーダルを開くと、背景・文字・入力・ボタンがダーク配色で十分なコントラストを持ち、白画面にならない。
- [ ] AC-02: 投稿コメントのゴミ箱タップで即削除されず、確認（削除/キャンセル）を経て初めて削除される。
- [ ] AC-03: 調査依頼コメント削除で `window.confirm`（OS 標準ダイアログ）が出ず、アプリ内インライン確認に置き換わっている。確認文言が i18n から供給される。
- [ ] AC-04: 調査依頼詳細の関連投稿で、ウシガエルの投稿に 🐸、アメリカザリガニの投稿に 🦞 が表示される（bullfrog で 🦞 にならない）。
- [ ] AC-05: スクリーンリーダー / DOM 上で AuthModal のタブが `role="tablist"`・各タブ `role="tab"`・選択中タブ `aria-selected="true"` を持つ（`RankingPage` と同等）。
- [ ] AC-06: `npm run i18n:check` / `tsc --noEmit` / lint / `next build` が成功する。

## 影響範囲
- `src/components/modals/ReportModal.tsx`（ダーク対応）
- `src/components/features/posts/CommentSection.tsx`（コメント削除の確認）
- `src/views/SurveyRequestPage.tsx`（window.confirm 置換・種絵文字修正）
- `src/components/modals/AuthModal.tsx`（タブ a11y）
- `src/components/modals/DeleteDialog.tsx` / `src/components/features/dashboard/PendingPostsSection.tsx`（確認方式の参照元・整合確認）
- `src/locales/{ja,en,ko,zh}/translation.json`（確認文言・タブラベル）

## 優先度
- **緊急度**: Medium / **重要度**: Medium / **理由**: クラッシュは無いが、(1) ダークモードで通報モーダルが事実上読めない、(4) タブが支援技術で操作しづらい、(3) 種アイコンの誤表示は市民科学アプリとして信頼性に関わる見える不具合。(2) の確認欠如は誤タップでコメントが即消える UX リスク。いずれも既存パターンへ寄せるだけの小改修で、一貫性・アクセシビリティの底上げとして中優先。
