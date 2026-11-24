# REQ-027: SEO動的メタデータとOGP画像の改善

## 背景
投稿詳細ページ・地域ページ・プロフィールページのOGP画像が固定の汎用画像（`/og-image.png`）を使用しており、SNSシェア時にコンテンツ固有のプレビューが表示されない。調査依頼ページにはcanonicalタグも欠如している。

## 現状の問題
- `src/app/post/[id]/page.tsx:33`: 投稿の写真がOGP画像に使用されず、固定の `/og-image.png` を使用
- `src/app/area/[municipality]/page.tsx:37`: 地域ページも汎用OGP画像
- `src/app/profile/[userId]/page.tsx:8-12`: メタデータが固定で、ユーザー名・投稿数等の動的情報なし
- `src/app/request/[id]/page.tsx:8-11`: メタデータが汎用的、canonical タグ欠如、OGP なし

## 目的
各ページのメタデータを動的に生成し、SNSシェア時のクリック率と検索エンジンでの表示品質を向上させる。

## 要件

### 機能要件
- [ ] FR-027-01: 投稿詳細ページのOGP画像に投稿の1枚目の写真URLを使用する（写真がない場合はデフォルト画像）
- [ ] FR-027-02: 投稿詳細ページのOGP description に投稿コメントの先頭100文字を使用する
- [ ] FR-027-03: 地域ページのOGP description に投稿件数・主要な種類情報を含める
- [ ] FR-027-04: プロフィールページのメタデータにユーザー名と投稿数を動的に含める
- [ ] FR-027-05: 調査依頼ページに `alternates.canonical` を設定する
- [ ] FR-027-06: 調査依頼ページにOpenGraph/Twitterメタデータを追加する

### 非機能要件
- [ ] NFR-027-01: メタデータ生成のためのDB問い合わせがページレンダリングを遅延させないこと（`generateMetadata` の効率的実装）
- [ ] NFR-027-02: OGP画像のURLはHTTPS絶対パスであること

## 受入条件
- [ ] AC-01: 投稿詳細ページをSNSシェアすると、投稿の写真がプレビュー画像として表示される
- [ ] AC-02: 調査依頼ページのHTMLソースに `<link rel="canonical">` が存在する
- [ ] AC-03: OGP Debugger（Facebook/Twitter）で各ページのメタデータが正しく表示される
- [ ] AC-04: プロフィールページのページタイトルにユーザー名が含まれる

## 影響範囲
- `src/app/post/[id]/page.tsx`
- `src/app/area/[municipality]/page.tsx`
- `src/app/profile/[userId]/page.tsx`
- `src/app/request/[id]/page.tsx`

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: SNSからの流入増加とSEO改善に直結するが、機能的な問題ではない
