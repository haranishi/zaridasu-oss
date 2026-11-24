### FR-004: 動的メタデータ生成

- **説明:** Next.js の `generateMetadata()` を使用し、各ページに最適なメタデータを動的生成
- **対象ページ:**
  - `/post/[id]`: 投稿の種類・場所・日時をタイトルに、写真を og:image に
  - `/request/[id]`: 調査依頼の種類・場所をタイトルに
  - `/profile/[userId]`: ユーザー名をタイトルに
  - その他静的ページ: 固定メタデータ
- **出力例（投稿詳細）:**
  ```typescript
  export async function generateMetadata({ params }): Promise<Metadata> {
    const post = await fetchPost(params.id)
    return {
      title: `${speciesLabel(post.species)}の${infoTypeLabel(post.info_type)} - ${post.municipality}`,
      description: post.comment?.slice(0, 120) || '秋田県の外来生物目撃情報',
      openGraph: {
        images: [post.photos?.[0] || '/og-image.png'],
      },
    }
  }
  ```

### FR-005: 動的サイトマップ生成

- **説明:** `app/sitemap.ts` で Supabase から承認済み投稿を取得し、動的サイトマップを生成
- **含むURL:**
  - 静的ページ: `/`, `/about`, `/terms`, `/privacy`, `/trends`, `/ranking`
  - 動的ページ: `/post/[id]`（全承認済み投稿）、`/request/[id]`（全調査依頼）
- **更新頻度:** `changeFrequency` を適切に設定（hourly〜monthly）

### FR-006: 認証ミドルウェア

- **説明:** Next.js Middleware で認証状態を検証し、保護ルートへのアクセスを制御
- **処理:**
  - `/dashboard`, `/admin/*`: 未認証 → `/` にリダイレクト
  - `/admin/*`（login以外）: admin ロールでない → `/admin/login` にリダイレクト
  - `/auth/callback`: Supabase Auth のコールバック処理（Cookie 設定）
- **ファイル:** `middleware.ts`（プロジェクトルート）

### FR-007: Leaflet 地図の動的インポート

- **説明:** Leaflet.js は `window` オブジェクトに依存するため、SSR では使用不可。`next/dynamic` で Client-Only ロードする
- **処理:**
  ```typescript
  const MapView = dynamic(() => import('@/components/features/map/MapView'), {
    ssr: false,
    loading: () => <MapSkeleton />,
  })
  ```
- **注意:** `leaflet.css` も MapView 内でのみインポート

### FR-008: PWA 対応

- **説明:** `vite-plugin-pwa` を `next-pwa` に置き換え、同等のオフライン機能を維持
- **処理:**
  - Service Worker: Workbox によるランタイムキャッシュ戦略を維持
  - オフラインキュー: IndexedDB（`idb`）による未送信投稿の保持を維持
  - マニフェスト: `app/manifest.ts` で動的生成
  - キャッシュ戦略:
    - OSM/GSI タイル: StaleWhileRevalidate（3日 TTL）
    - Supabase API: NetworkFirst（5分 TTL）
    - 静的アセット: CacheFirst

### FR-009: 多言語（i18n）対応

- **説明:** i18next を `next-intl` または引き続き `i18next` + `react-i18next` で対応
- **方式:** 現行方式を維持（URL パスではなく localStorage で言語切替）
  - 理由: URL ベース（`/en/post/:id`）は既存 URL 構造の変更が必要で移行リスクが高い
  - 将来的に URL ベースへの移行は可能
- **Server Components での翻訳:** サーバー側でも翻訳を適用するため、Cookie から言語設定を読み取る仕組みを追加

### FR-010: 画像最適化

- **説明:** Next.js の `next/image` コンポーネントを使用し、投稿写真の最適化を実施
- **処理:**
  - Supabase Storage の画像 URL を `next/image` で最適化
  - WebP 自動変換、レスポンシブサイズ出力
  - `next.config.ts` の `images.remotePatterns` に Supabase ドメインを登録
- **設定:**
  ```typescript
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }
    ]
  }
  ```

---

