## 背景

### 問題A: jsx-a11y が3ルールしか有効化されておらず、他の全問題が CI をすり抜ける — Medium（ただし他問題の再発防止の前提）

- `eslint.config.js:4` で `import jsxA11y from 'eslint-plugin-jsx-a11y'` しているが、**`jsxA11y.flatConfigs.recommended` はどこにも spread されていない**。
- 有効なルールは JS/JSX ブロック（`eslint.config.js:51-53`）と TS/TSX ブロック（`:114-116`）でそれぞれ以下の3つだけ。
  - `jsx-a11y/alt-text`
  - `jsx-a11y/click-events-have-key-events`
  - `jsx-a11y/no-static-element-interactions`
- 結果として `label-has-associated-control`（→問題B の19件）、`control-has-associated-label`（→問題G）、`aria-props` / `role-has-required-aria-props` / `no-noninteractive-element-to-interactive-role` などが**すべてオフ**。「eslint-plugin-jsx-a11y 導入済み」でありながら実質ほぼ無効で、CI が退行を止められない。
- 自動テスト側も同様に薄い。`vitest-axe` を使っているのは `src/components/features/posts/__tests__/PostForm.a11y.test.tsx`、`src/components/modals/__tests__/SurveyRequestForm.a11y.test.tsx`、`src/views/__tests__/LandingPage.test.tsx:186-202` の3ファイルのみで、**モーダル11件・地図・図鑑・ダッシュボードは axe 未カバー**。

### 問題B: フォームコントロール19個にプログラム的ラベルが無い — High

視覚的にはラベルが見えるが、`<label>` と入力欄が `htmlFor` / `id` で関連付いていないため、a11y ツリー上でアクセシブルネームを持たない。スクリーンリーダーは「コンボボックス」「編集テキスト」のように**型だけを読み上げる**。axe の `label` / `select-name` 違反に該当する。

| ファイル | 行 | 対象 |
|---|---|---|
| `src/components/modals/EditDialog.tsx` | 110, 116, 122, 129, 141, 151, 162 | 種類 select / 情報種別 select / 市区町村 select / 個体数 number / 観察日 date / コメント textarea / 写真 |
| `src/components/features/dashboard/FilterBar.tsx` | 211, 217, 224, 231, 238 | 期間 / 市区町村 / 種類 / 情報種別 / 並び順 の各 select |
| `src/components/features/dashboard/CSVExportSection.tsx` | 60, 69, 78, 89 | 開始日 / 終了日 / 種類 / 市区町村 |
| `src/components/modals/ReportModal.tsx` | 139 | 通報コメント textarea |
| `src/views/admin/AdminLoginPage.tsx` | 187, 202 | 管理者メール / パスワード |

- `AdminLoginPage` の2件はパスワードマネージャの自動入力精度にも影響する。
- **同リポジトリ内に正しい実装が既に存在する**ため、これは知識の欠落ではなく適用漏れである。
  - `src/components/features/posts/LocationSection.tsx:141,170` — `htmlFor="postform-municipality"` と `id` の紐付け（コメントに REQ-040 の方針が明記されている）。
  - `src/components/features/posts/PostForm.tsx:331,361` および `src/components/modals/SurveyRequestForm.tsx:160-164` — `role="group"` ＋ `aria-labelledby` による正しいグループ化。

### 問題C: useFocusTrap がフォーカスを復帰しないため、モーダルを閉じるたびにタブ順が先頭へ戻る — High

- `src/hooks/useFocusTrap.ts:18-45`。`:26` で `first?.focus()` してトラップ内へフォーカスを移すが、**開く前の `document.activeElement` を保存していない**。cleanup（`:44`）は `removeEventListener` のみ。
- したがってモーダルを閉じるとフォーカスは `<body>` に戻り、キーボード利用者は**毎回ページ先頭から Tab をやり直す**ことになる。どのトリガーから開いたのかという文脈も失われる。WCAG 2.4.3（フォーカス順序）。
- 全モーダル共通の基盤フックであるため、影響は11箇所すべてに及ぶ。
  `src/components/modals/AuthModal.tsx:203` / `src/components/features/posts/PostForm.tsx:75` / `src/components/modals/ReportModal.tsx:41` / `src/components/modals/EditDialog.tsx:57` / `src/components/modals/DeleteDialog.tsx:32` / `src/components/modals/DeletePostDialog.tsx:26` / `src/components/modals/RejectDialog.tsx:34` / `src/components/modals/EditProfileModal.tsx:82` / `src/components/modals/MapModal.tsx:64` / `src/components/modals/SurveyRequestForm.tsx:62` / `src/views/DashboardPage.tsx:44` / `src/views/admin/AdminUsersPage.tsx:55,167`
- なお REQ-160 で導入された `resetKey`（タブ切替時のトラップ張り直し）は正しく機能しており、修正時に壊さないこと。

### 問題D: DrawerMenu が閉状態でも DOM に残り、20 以上のコントロールがタブ順に残る — High

- `src/components/layout/Header.tsx:110-121` は `DrawerMenu` を `open` の値に関わらず**常時マウント**する。
- `src/components/layout/DrawerMenu.tsx:62-69` は閉状態を `-translate-x-full` で画面外へ出すだけで、`hidden` / `inert` / `aria-hidden` / `tabindex="-1"` のいずれも付与していない。一方で **`role="dialog"` と `aria-modal="true"` は常時付いている**（`:66-67`）。
- 結果として次の2つが起こる。
  1. ドロワー内の 20 以上のコントロール（ログイン/ログアウト、ヒートマップ切替、地図タイプ3種、言語4種、テーマ、各種リンク）が**閉じている間もタブ順に残り**、スクリーンリーダーは非表示メニューを読み上げる。
  2. `aria-modal="true"` を尊重する支援技術では、**ドロワーが閉じている間も背景（本文）が無視される可能性がある**。
- `DrawerMenu.tsx` は `useEscapeKey`（`:49`）は使っているが **`useFocusTrap` を使っていない**（他11モーダルは使用）。開いたときにフォーカスがドロワー内へ移らない。

### 問題E: フィルタードロワーがダイアログとして実装されていない — Medium

- `src/components/features/dashboard/FilterBar.tsx:182-188` のオーバーレイは `role="presentation"` のみで、**`role="dialog"` / `aria-modal` / アクセシブルネーム / フォーカストラップ / 背景の無効化がすべて無い**。スクリーンリーダー利用者に「モーダルが開いた」ことが伝わらず、背景と混在して読み上げられる。
- `:187` の Escape ハンドラは**フォーカスされない要素の `onKeyDown`** に置かれているため、フォーカスがドロワー内に入るまで発火しない（＝開いた直後は Escape が効かない）。
- `:203` の閉じるボタンは中身が `<X size={20} />` のみで `aria-label` / `title` / テキストがなく、「ボタン」とだけ読み上げられる。
- 他11モーダルが `role="dialog"` ＋ `aria-modal` ＋ `useFocusTrap` ＋ `useEscapeKey` の標準形なので、ここだけが方針から外れている。
