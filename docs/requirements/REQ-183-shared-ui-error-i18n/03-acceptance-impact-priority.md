## 受入条件
- [ ] AC-01: 言語を en / ko / zh に切り替えた状態で、ボトムナビ（地図/統計/投稿/ランキング/マイページ）・ヘッダーのページタイトル・ドロワーメニュー項目が当該言語で表示される。
- [ ] AC-02: en / ko / zh で投稿フォームのバリデーションエラー（位置未選択・文字数超過・ファイル形式/サイズ・投稿上限）と Toast、調査依頼作成エラーが当該言語で表示される（`usePostForm`/`useSurveyRequests`/`useSurveyResponses`/`getErrorMessage` 経由分を含む）。
- [ ] AC-03: ダッシュボード（下書き/自分の投稿）・プロフィール・調査依頼詳細の日付表示が選択言語のロケールで整形される（`ja-JP` 固定・`date-fns` `ja` 固定が残っていない）。
- [ ] AC-04: 投稿カード/ギャラリー/共有テキスト/ダッシュボード一覧の「種別」「情報種別」表示が、en/ko/zh で `species.*`/`infoType.*` の訳語になる（`アメリカザリガニ`/`目撃` 等が直接出ない）。
- [ ] AC-05: `AuthModal` のメール欄に不正な形式を入力したとき、en/ko/zh で当該言語のエラーが表示され、`AuthModal.tsx:337` の `t()` 呼び出しに `defaultValue` 引数が無い。
- [ ] AC-06: `src/utils/errorHandler.ts` の `getErrorMessage()` が日本語完成文字列を直接 return していない（i18n キー or コードを返す）。
- [ ] AC-07: 対象ファイル群（本書「現状の問題」C〜H で列挙したコンポーネント/フック）の該当行に、画面表示用の生日本語リテラル（aria-label 含む）が残っていない。
- [ ] AC-08: `npm run i18n:check` が exit 0、`next build` が成功する。
- [ ] AC-09（FR-183-15 採用時）: 生日本語リテラル検出 lint/スクリプトが CI で実行され、対象範囲に新規の未翻訳リテラルが入ると検出される。

## 影響範囲
- エラー基盤: `src/utils/errorHandler.ts`（戻り値設計変更）と全呼び出し側
- フック: `src/hooks/usePostForm.ts`, `src/hooks/useOfflineQueue.ts`, `src/hooks/useSurveyRequests.ts`, `src/hooks/useSurveyResponses.ts`
- レイアウト: `src/components/layout/BottomNav.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/DrawerMenu.tsx`
- ホーム: `src/app/(home)/HomeInteractive.tsx`
- UI 部品: `src/components/ui/Toast.tsx`, `src/components/ui/InstallBanner.tsx`, `src/components/features/posts/PostForm.tsx`, `src/components/features/posts/PhotoGallery.tsx`, `src/components/features/posts/LikeShareSection.tsx`, `src/components/features/home/PriorityAreaNudge.tsx`, `src/components/modals/SurveyRequestForm.tsx`
- ダッシュボード: `src/components/features/dashboard/PendingPostsSection.tsx`, `src/components/features/dashboard/MyPostsSection.tsx`
- 日付/数値: `src/views/ProfilePage.tsx`, `src/views/SurveyRequestPage.tsx`, `src/lib/dateLocales.ts`(利用), `src/lib/constants.ts`(label 参照箇所の確認)
- キー欠落: `src/components/modals/AuthModal.tsx`
- 翻訳リソース: `src/locales/{ja,en,ko,zh}/translation.json`（`errors`/`bottomNav` 等の新規ネームスペース・`auth.errors.invalidEmail`・各部品キーを追加）
- CI: `scripts/check-i18n-parity.ts`（通過確認）+（オプション）生日本語検出 lint/スクリプト

## 優先度
- **緊急度**: High / **重要度**: High / **理由**: 4 言語を公称しているアプリの共有 UI・フック・エラー基盤が日本語固定で、en/ko/zh ユーザーは主要操作（ナビゲーション・投稿エラー・通知）で恒常的に日本語に遭遇する。`check-i18n-parity.ts` の死角（生リテラル・全言語一様欠落キー）に該当するため CI では一切検出されず放置されやすい。土台層であるため、個別ページ翻訳（REQ-184）より先に整えないと多言語体験が成立しない。改修は層ごとに分割可能で段階適用できる。
