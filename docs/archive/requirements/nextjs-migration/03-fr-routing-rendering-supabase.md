## Step 3: 機能要件

### FR-001: Next.js App Router によるページルーティング

- **説明:** 既存の react-router-dom v6 のルーティングを Next.js App Router（ファイルベースルーティング）に移行
- **ディレクトリ構造:**
  ```
  app/
  ├── layout.tsx              # ルートレイアウト (HTML, Providers)
  ├── page.tsx                # / (トップページ)
  ├── post/[id]/page.tsx      # /post/:id (投稿詳細)
  ├── request/[id]/page.tsx   # /request/:id (調査依頼詳細)
  ├── about/page.tsx          # /about
  ├── terms/page.tsx          # /terms
  ├── privacy/page.tsx        # /privacy
  ├── dashboard/page.tsx      # /dashboard (要認証)
  ├── trends/page.tsx         # /trends
  ├── ranking/page.tsx        # /ranking
  ├── profile/[userId]/page.tsx # /profile/:userId
  ├── offline/page.tsx        # /offline
  ├── auth/callback/page.tsx  # /auth/callback
  ├── admin/
  │   ├── layout.tsx          # 管理者レイアウト (要認証)
  │   ├── login/page.tsx
  │   ├── page.tsx            # ダッシュボード
  │   ├── posts/page.tsx
  │   ├── reports/page.tsx
  │   ├── users/page.tsx
  │   ├── comments/page.tsx
  │   └── logs/page.tsx
  ├── api/
  │   └── og/route.ts         # 動的 OGP 画像生成
  ├── sitemap.ts              # 動的サイトマップ
  ├── robots.ts               # robots.txt 生成
  └── not-found.tsx           # 404
  ```
- **エラーハンドリング:** 各ルートセグメントに `error.tsx` と `loading.tsx` を配置

### FR-002: レンダリング戦略

- **説明:** 各ページに最適なレンダリング戦略を適用

| ページ | 戦略 | 理由 |
|--------|------|------|
| `/` (トップ) | SSR + Client Hydration | 投稿データが頻繁に更新、地図はクライアントのみ |
| `/post/[id]` | SSR（`dynamic = 'force-dynamic'`） | SEO 必須、最新データが必要 |
| `/request/[id]` | SSR | SEO 必須、最新ステータスが必要 |
| `/about` | SSG（静的） | 更新頻度が低い |
| `/terms`, `/privacy` | SSG（静的） | 更新頻度が低い |
| `/trends` | ISR（`revalidate = 3600`） | 統計データは1時間ごとで十分 |
| `/ranking` | ISR（`revalidate = 3600`） | ランキングは1時間ごとで十分 |
| `/profile/[userId]` | SSR | ユーザーのプロフィール・バッジが動的 |
| `/dashboard` | Client Only（`'use client'`） | 認証必須、ユーザー固有データ |
| `/auth/callback` | Client Only | OAuth フロー処理 |
| `/admin/*` | Client Only | 認証必須、管理操作 |
| `/offline` | SSG（静的） | オフライン時表示用 |

### FR-003: Supabase サーバー/クライアント分離

- **説明:** `@supabase/ssr` パッケージを使用し、Server Components 用と Client Components 用の Supabase クライアントを分離
- **処理:**
  - サーバー用: `createServerClient()` — Cookie ベース認証、Server Components / Route Handlers / Middleware で使用
  - クライアント用: `createBrowserClient()` — 従来通りの Supabase JS クライアント、Client Components で使用
- **ファイル構成:**
  ```
  lib/
  ├── supabase/
  │   ├── server.ts    # Server Component 用クライアント
  │   ├── client.ts    # Client Component 用クライアント
  │   └── middleware.ts # Middleware 用クライアント
  ```

