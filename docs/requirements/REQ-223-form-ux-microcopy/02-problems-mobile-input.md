## 現状の問題

（ファイルパス:行番号、または「設定不在の事実」つき）

### 1. モバイル入力最適化（`inputmode` / `enterkeyhint`）がリポジトリ全体で皆無

- `inputMode` / `enterKeyHint` は **src 全体で 0 件**（`grep -rn "inputMode\|enterKeyHint\|inputmode\|enterkeyhint" src` のヒットは無し）。`autoComplete` も honeypot（`src/components/features/posts/PostForm.tsx:287` の `autoComplete="off"`）と `AuthModal` のメール・パスワード（`src/components/modals/AuthModal.tsx:344,365,394`）にあるのみで、他フォームには無い。
- 数値入力は `type="number"` のみで `inputMode` 未指定：
  - 個体数 `src/components/features/posts/PostForm.tsx:368`（`type="number" min="1" max={COUNT_MAX}`）
  - 調査時間 `src/components/features/posts/PostForm.tsx:406`（`type="number" min="1" max="480"`）
  - 気温 `src/components/features/posts/WeatherSelector.tsx:104`（`type="number" step="0.1"`）／湿度 `src/components/features/posts/WeatherSelector.tsx:109`（`type="number" step="1"`）
  `type="number"` は iOS でテンキーを出すが整数専用キーボードの最適制御が弱く、`inputmode="numeric"`（整数：個体数・調査時間・湿度）/`inputmode="decimal"`（小数：気温）の併用が推奨される（`アクセシビリティとUXライティング.md`）。
- メール入力 `src/components/modals/AuthModal.tsx:329-348` は `type="email" autoComplete="email"` だが `inputMode="email"`・`enterKeyHint="next"`（または `done`）が無い。`AuthCallbackPage`・`AdminLoginPage` の email/password も同様（`src/views/AuthCallbackPage.tsx:160,178`、`src/views/admin/AdminLoginPage.tsx:170,182`）。
- 市区町村・コメント・調査理由などのテキスト欄にも `enterKeyHint`（送信は明示ボタンのため `enterKeyHint` は補助だが、複数欄フォームの遷移最適化に有効）が無い。

### 2. 入力欄のフォントが 14px（`text-sm`）で、iOS Safari の自動ズームが起きうる

- フォーム入力の共通スタイル `src/lib/formStyles.ts:7`（`formInputCls`）・`:16`（`dialogInputCls`）はいずれも `text-sm`（= 0.875rem = 14px）。
- `AuthModal` の独自 `inputCls`（`src/components/modals/AuthModal.tsx:213`）、`SurveyRequestForm` の独自 `inputCls`（`src/components/modals/SurveyRequestForm.tsx:79`）も `text-sm`。
- **16px 以上を指定した入力は 0 件**（`grep -rn "text-base\|16px\|text-\[16" src/lib/formStyles.ts src/components/modals/AuthModal.tsx src/components/modals/SurveyRequestForm.tsx` ヒット無し）。iOS Safari は **入力欄のフォントが 16px 未満だとフォーカス時に自動ズーム**するため、フォーム入力のたびに画面が拡大して文脈を失う（`アクセシビリティとUXライティング.md`）。現地でスマホ投稿する本 PF の中核 UX を損なう。
- `formInputCls` は LocationSection / WeatherSelector / PostForm / CSVExportSection / EditDialog / ReportModal / DeleteDialog / AuthModal で共有（`grep -rln "formInputCls\|formStyles" src`）。共通関数を直すと広く効く一方、影響範囲の回帰確認が要る。
