# REQ-031: アクセシビリティ改善（ARIA属性・セマンティクス）

## 背景
既存のREQ-013（Skip Link）、REQ-014（aria-label）、REQ-015（reduced motion）に加え、複数のコンポーネントでARIA属性の欠如やセマンティックHTMLの不足が見つかった。WCAG 2.1 Level AA 準拠に向けた追加対応が必要。

## 現状の問題
- `src/components/ui/PhotoViewer.tsx:56-57`: `role="dialog"` はあるが `aria-labelledby` 欠如（スクリーンリーダーがダイアログの目的を把握できない）
- `src/components/modals/EditDialog.tsx:106-107`: `role="dialog"` はあるが `aria-describedby` 欠如
- `src/components/features/dashboard/FilterBar.tsx:161-181`: セレクトフィールドに `aria-required` 属性なし
- `src/views/HomePage.tsx:171-223`: タブリストに `aria-orientation="horizontal"` 未指定、Home/End キーハンドリングなし
- `src/components/features/posts/PostCard.tsx:83`: 画像の alt 属性フォールバックが空文字 `''`
- `src/components/features/dashboard/PendingPostsSection.tsx:76`: 画像の alt フォールバックが空文字

## 目的
WCAG 2.1 Level AA 準拠レベルに向けて、ARIA属性とセマンティクスを改善し、支援技術ユーザーのアクセシビリティを向上させる。

## 要件

### 機能要件
- [ ] FR-031-01: PhotoViewer ダイアログに `aria-labelledby` を追加し、表示中の画像番号等をタイトルとして関連付ける
- [ ] FR-031-02: EditDialog に `aria-describedby` を追加し、フォームの説明テキストを関連付ける
- [ ] FR-031-03: FilterBar の必須セレクトフィールドに `aria-required="true"` を追加する
- [ ] FR-031-04: HomePage のタブリストに `aria-orientation="horizontal"` を追加する
- [ ] FR-031-05: タブリストに Home/End キーハンドリングを追加する（Home: 最初のタブ、End: 最後のタブにフォーカス）
- [ ] FR-031-06: PostCard と PendingPostsSection の画像 alt フォールバックを意味のあるテキスト（例: `t('common.unknownSpecies')`）に置換する
- [ ] FR-031-07: 「いいね」ボタンの処理中に `aria-busy="true"` と視覚的 disabled 状態を追加する（`src/views/DetailPage.tsx:85`）

### 非機能要件
- [ ] NFR-031-01: eslint-plugin-jsx-a11y の警告が0件であること
- [ ] NFR-031-02: 全ダイアログが Escape キーで閉じられること（既存の useEscapeKey を活用）

## 受入条件
- [ ] AC-01: PhotoViewer の `<div role="dialog">` に `aria-labelledby` 属性が存在する
- [ ] AC-02: タブリストで Home キーを押すと最初のタブにフォーカスが移動する
- [ ] AC-03: `grep -rn 'alt=""' src/components/` がヒットしない（空 alt の解消）
- [ ] AC-04: `npx eslint --rule 'jsx-a11y/*: error' src/` でエラーが0件
- [ ] AC-05: VoiceOver（macOS）でモーダルの目的が読み上げられる

## 影響範囲
- `src/components/ui/PhotoViewer.tsx`
- `src/components/modals/EditDialog.tsx`
- `src/components/features/dashboard/FilterBar.tsx`
- `src/views/HomePage.tsx`
- `src/components/features/posts/PostCard.tsx`
- `src/components/features/dashboard/PendingPostsSection.tsx`
- `src/views/DetailPage.tsx`

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: アクセシビリティは法的要件にもなりうる重要事項だが、既にREQ-013〜015で基礎対応が進んでおり、追加改善の位置づけ
