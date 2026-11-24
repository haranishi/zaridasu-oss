# REQ-276: 動的OG画像の配線とPWA manifest強化

優先度: **P2** ／ 深刻度: **Medium** ／ 種別: SEO・PWA（機会損失）

## 背景

### 問題A: 実装済みの `/api/og` がどのページからも呼ばれていない
`src/app/api/og/route.tsx` は `title/species/area` 入り 1200×630 を生成する完成品（FR-008/API-002、テスト有り）。しかし全 `generateMetadata` は `post.photos?.[0] || DEFAULT_OG_IMAGE`（静的 `/og-image.png`）のみで、動的OGへの参照は0件。写真なし投稿・地域・種・調査依頼ページの共有カードが全て同一の汎用画像になり、SNS共有時の視認性・CTRの機会損失。

### 問題B: manifest に `screenshots` と `id` が無い
`src/app/manifest.ts`。screenshots（form_factor: wide/narrow）が無いため Chrome/Edge のリッチインストールUIが出ない。`id` 未指定で PWA のアイデンティティが start_url 依存。

## 機能要件

- **FR-276-01**: `generatePostSEO`（写真なし時）・area・species・request の OG/Twitter images を `/api/og?title=…&species=…&area=…` に配線する（写真あり投稿は現行どおり写真優先）。
- **FR-276-02**: `public/screenshots/` にモバイル縦（narrow）とデスクトップ横（wide）のスクリーンショットを配置し、`manifest.screenshots` に追加する。`id: '/'` を付与する。
- **FR-276-03**: `/api/og` のクエリ上限（TITLE_MAX 等）と `s-maxage` キャッシュは現行仕様を維持する。

## 受入基準

- **AC-01**: 写真なし投稿の `og:image` が `/api/og?...` を指し、実URLで1200×630画像が返る。
- **AC-02**: Lighthouse PWA 監査（またはmanifest検証）で screenshots/id が認識される。

## 対象外

- スクリーンショット画像の撮影自体はユーザー確認を要する（実UIの見せ方の判断を含むため）。プレースホルダは置かない。
