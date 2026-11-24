# REQ-028: UIデザインの一貫性改善

## 背景
コンポーネント間でエラー表示・ローディング表示・ボタンのdisabled状態のスタイルが統一されていない。ユーザーに一貫性のない視覚的フィードバックを与え、アプリ全体の品質感を低下させている。

## 現状の問題
- **エラー表示の不統一**:
  - `src/components/modals/ReportModal.tsx:145`: `bg-red-50 border border-red-200 text-red-700`
  - `src/components/modals/AuthModal.tsx:365`: `bg-red-500/10 border border-red-500/20 text-red-400`
- **ローディング表示の不統一**:
  - AuthModal: `<Loader2 className="animate-spin" />` アイコン使用
  - PendingPostsSection: テキストのみ `"送信中..."`
  - 一部コンポーネントではスピナーなし
- **ボタンdisabled状態の不統一**:
  - 一部: `disabled:opacity-50` のみ
  - 一部: `disabled:opacity-50 disabled:cursor-not-allowed`
  - 一部: disabled属性なしでテキスト変更のみ

## 目的
共通UIコンポーネント（ErrorAlert, LoadingButton 等）を整備し、アプリ全体で一貫したUIパターンを適用する。

## 要件

### 機能要件
- [ ] FR-028-01: 共通 `ErrorAlert` コンポーネントを作成し、エラー表示を統一する（ライト/ダークモード対応）
- [ ] FR-028-02: 共通 `LoadingButton` コンポーネントを作成し、ローディング状態のボタン表示を統一する（Loader2スピナー + テキスト）
- [ ] FR-028-03: 全モーダル・フォームのエラー表示を `ErrorAlert` に置換する
- [ ] FR-028-04: 全ボタンのローディング状態を `LoadingButton` に置換する
- [ ] FR-028-05: ボタンの disabled 状態を統一する（`opacity-50 cursor-not-allowed`）

### 非機能要件
- [ ] NFR-028-01: 共通コンポーネントはダークモードに対応すること
- [ ] NFR-028-02: 既存のコンポーネントテストが破壊されないこと

## 受入条件
- [ ] AC-01: `src/components/ui/ErrorAlert.tsx` が存在し、3箇所以上で使用されている
- [ ] AC-02: `src/components/ui/LoadingButton.tsx` が存在し、3箇所以上で使用されている
- [ ] AC-03: エラー表示のCSSクラスがコンポーネント間で統一されている（grep で確認）
- [ ] AC-04: ダークモード時にエラー表示が視認可能である

## 影響範囲
- `src/components/ui/ErrorAlert.tsx`（新規）
- `src/components/ui/LoadingButton.tsx`（新規）
- `src/components/modals/AuthModal.tsx`
- `src/components/modals/ReportModal.tsx`
- `src/components/modals/EditDialog.tsx`
- `src/views/admin/AdminLoginPage.tsx`
- `src/components/features/posts/PostForm.tsx`
- `src/components/features/dashboard/PendingPostsSection.tsx`

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: ユーザー体験の品質向上に寄与するが、機能的な問題ではない
