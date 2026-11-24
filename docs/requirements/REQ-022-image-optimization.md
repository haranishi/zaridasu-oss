# REQ-022: 画像最適化（next/image 導入・サムネイル活用）

## 背景
投稿一覧・投稿フォーム・編集ダイアログで Supabase Storage の画像を生の `<img>` タグで表示しており、Next.js の画像最適化機能が活用されていない。また、`toThumbnailUrl()` ユーティリティが実装済みだが未使用。大きな画像がそのまま配信され、LCP・帯域幅・モバイルUXに悪影響がある。

## 現状の問題
- `src/components/features/posts/PostCard.tsx:74`: 生の `<img>` タグで投稿写真を表示（next/image 未使用）
- `src/components/features/posts/PostForm.tsx:623`: プレビュー画像に生の `<img>` 使用
- `src/components/modals/EditDialog.tsx:179`: 編集ダイアログのプレビューに生の `<img>` 使用
- `src/lib/imageUtils.ts:1-13`: `toThumbnailUrl()` が定義されているが、コードベースのどこからも呼び出されていない
- `next.config.ts:7-14`: Supabase の remotePatterns は設定済み（next/image 利用準備は完了）

## 目的
全ての画像表示を最適化し、ページ読み込み速度と帯域幅効率を改善する。

## 要件

### 機能要件
- [ ] FR-022-01: `PostCard.tsx` の投稿写真を `next/image` に置換する（width/height/sizes 指定）
- [ ] FR-022-02: `PostForm.tsx` のプレビュー画像を `next/image`（ローカルURL用）に置換、またはCLS防止のためアスペクト比固定コンテナを使用する
- [ ] FR-022-03: `EditDialog.tsx` のプレビュー画像に同様の最適化を適用する
- [ ] FR-022-04: 投稿一覧（PostCard）では `toThumbnailUrl()` を使用し、サムネイルサイズの画像を配信する
- [ ] FR-022-05: 詳細ページではフルサイズ画像を遅延読み込み（`loading="lazy"`）で表示する
- [ ] FR-022-06: `PendingPostsSection.tsx:76` の `<Image alt={sp?.label || ''}>` の空 alt フォールバックを適切なテキストに修正する

### 非機能要件
- [ ] NFR-022-01: 投稿一覧ページのLCP（Largest Contentful Paint）をモバイルで2.5秒以下にする
- [ ] NFR-022-02: 画像にCLS（Cumulative Layout Shift）を発生させない（アスペクト比を事前指定）

## 受入条件
- [ ] AC-01: PostCard の画像が `<Image>` コンポーネントでレンダリングされている
- [ ] AC-02: PostCard の画像URLに `?width=400&height=300` 等のサムネイルパラメータが含まれている
- [ ] AC-03: DevTools Network タブで画像が WebP 形式で配信されている（Next.js 自動変換）
- [ ] AC-04: `<img>` タグが投稿関連コンポーネントから除去されている（grep で確認）
- [ ] AC-05: Lighthouse Performance スコアが改善する（特に LCP）

## 影響範囲
- `src/components/features/posts/PostCard.tsx`
- `src/components/features/posts/PostForm.tsx`
- `src/components/modals/EditDialog.tsx`
- `src/components/features/dashboard/PendingPostsSection.tsx`
- `src/lib/imageUtils.ts`（使用開始）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: ユーザー体験に直結するパフォーマンス改善。next/image の remotePatterns は設定済みで実装コストが低い
