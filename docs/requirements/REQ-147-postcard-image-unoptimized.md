# REQ-147: 投稿画像の最適化が `unoptimized` で無効化されている

## 背景
ザリダスの投稿一覧で各投稿を表示する `PostCard` コンポーネントは、サムネイル画像を `next/image` の `<Image>` で描画している。`next.config.ts` では `images.formats` に `['image/avif', 'image/webp']` が設定され、`remotePatterns` で Supabase Storage（`*.supabase.co` の `/storage/v1/object/public/**`）も最適化対象として許可済みである。本来であれば Next.js Image Optimization により AVIF/WebP への変換・リサイズ・キャッシュが働く構成になっている。

## 現状の問題
`src/components/features/posts/PostCard.tsx:82` の写真サムネイル `<Image>` に `unoptimized` 属性が付与されている。

```tsx
// src/components/features/posts/PostCard.tsx:75-83
<Image
  src={String(toThumbnailUrl(post.photos![0], 400) || post.photos![0])}
  alt={species ? t(`species.${post.species}`) : t('postCard.unknown')}
  width={400}
  height={300}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  className="w-full h-full object-cover"
  unoptimized   // ← これにより Next.js の画像最適化が完全にバイパスされる
/>
```

- `src` には `toThumbnailUrl(post.photos![0], 400)`（幅400px相当のサムネ URL）が渡されているが、`unoptimized` により Next.js の Image Optimization（AVIF/WebP 変換、レスポンシブリサイズ、`/_next/image` 経由の最適化キャッシュ）が一切働かない。
- 結果として、`sizes` 属性で表示幅のヒントを与えているにもかかわらず、元画像形式（JPEG/PNG 等）のまま 400px サムネが配信され、AVIF/WebP による転送量削減と DPR 別 `srcset` 生成の恩恵を受けられない。
- `next.config.ts:13-22` の `formats`／`remotePatterns` 設定が PostCard サムネに対して死んでいる状態である。
- 同ファイル内の種別アイコン（`PostCard.tsx:87` の `/images/unknown.png` 等のローカル静的画像）や写真なしヘッダーアイコン（`:105-111`）には `unoptimized` は付いていないため、影響範囲はサムネイル写真の `<Image>`（`:75-83`）に限定される。

## 目的
PostCard の投稿サムネイルに対し Next.js Image Optimization を有効化し、AVIF/WebP 配信とレスポンシブ `srcset` によって転送量と LCP を改善する。`unoptimized` を付与している現状の根拠（過去に何らかの理由で無効化したのか、惰性で付いているのか）を確認したうえで、最適化を有効化しても表示が破綻しないことを担保する。

## 要件
### 機能要件
- [ ] FR-147-01: `src/components/features/posts/PostCard.tsx:82` の写真サムネイル `<Image>` から `unoptimized` 属性を削除する。
- [ ] FR-147-02: `next.config.ts:13-22` の `remotePatterns` が、`toThumbnailUrl` の生成する Supabase Storage URL のホスト・パスをカバーしていることを確認する。カバーしていない場合は `remotePatterns` を追補する（クエリパラメータ付き URL を含めて最適化対象として通ること）。
- [ ] FR-147-03: `toThumbnailUrl(post.photos![0], 400)` が `null`/`undefined` を返した場合のフォールバック（`|| post.photos![0]`）でも、Supabase Storage の許可済みホストに収まり最適化が働くことを確認する。

### 非機能要件（該当する場合）
- [ ] NFR-147-01: 同一サムネイルの転送サイズが、最適化後（AVIF/WebP）で最適化前（元形式 400px）より削減されていること（代表的な投稿画像で測定）。
- [ ] NFR-147-02: 投稿一覧ページの LCP が悪化しないこと。

## 受入条件
- [ ] AC-01: PostCard サムネイルの `<Image>` 出力 `src` が `/_next/image?url=...` 経由になり、ブラウザの Accept ヘッダーに応じて AVIF または WebP が配信される。
- [ ] AC-02: Supabase Storage 上のサムネ・フォールバック双方の URL が最適化対象として 200 で配信され、画像が崩れず表示される。
- [ ] AC-03: `next build` がエラーなく完了し、投稿一覧および本番ビルドでサムネイル表示に視覚的退行がない。

## 影響範囲
- `src/components/features/posts/PostCard.tsx`（写真サムネイル `<Image>`、`:75-83`）
- `next.config.ts`（`images.remotePatterns`、`:13-22` — 追補が必要な場合のみ）
- 投稿一覧を描画する全画面（PostCard を利用する一覧・ダッシュボード等）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 機能破壊はなく描画自体は成立しているが、最適化設定が用意済みにもかかわらずサムネで無効化されており、転送量・LCP の改善余地を取りこぼしている。1行の属性削除で効果が見込め費用対効果が高い。
