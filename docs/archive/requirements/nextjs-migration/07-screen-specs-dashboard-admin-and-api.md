### SC-003: ダッシュボード（`/dashboard`）

- **URL:** `/dashboard`
- **レンダリング:** Client Only（`'use client'`）
- **認証:** 必須（未認証 → Middleware でリダイレクト）

```
+------------------------------------------+
| ヘッダー                                  |
+------------------------------------------+
| プロフィールカード (アバター, 名前, 編集)   |
+------------------------------------------+
| KPI (投稿数, コメント数, 活動圏)           |
+------------------------------------------+
| バッジ一覧 (BadgeSection)                 |
+------------------------------------------+
| 自分の投稿一覧 (MyPostsSection)           |
+------------------------------------------+
| 未送信投稿 (PendingPostsSection - offline) |
+------------------------------------------+
| 全体統計 (collapsible)                    |
+------------------------------------------+
| CSVエクスポート (collapsible)             |
+------------------------------------------+
| アカウント削除                             |
+------------------------------------------+
```

### SC-004: 管理者ページ（`/admin/*`）

- **レンダリング:** Client Only
- **認証:** 管理者ロール必須（Middleware で検証）
- **ページ構成:**
  - `/admin` — ダッシュボード（KPI・チャート・最近の投稿）
  - `/admin/posts` — 投稿審査（承認/却下・一括操作・AI結果表示）
  - `/admin/reports` — 通報管理
  - `/admin/users` — ユーザー管理（ロール付与/剥奪）
  - `/admin/comments` — コメント管理
  - `/admin/logs` — 監査ログ閲覧

---

## Step 6: API 仕様

### API-001: 動的サイトマップ

- **Method:** GET
- **Path:** `/sitemap.xml`（`app/sitemap.ts`）
- **認証:** 不要
- **処理:** Supabase から承認済み投稿・調査依頼を取得し、XML サイトマップを生成
- **Response:** `application/xml`
- **備考:** Next.js 組み込み機能（`MetadataRoute.Sitemap`）

### API-002: OGP 画像生成（将来検討）

- **Method:** GET
- **Path:** `/api/og?title=...&species=...&image=...`
- **認証:** 不要
- **処理:** `@vercel/og`（Satori）で動的 OGP 画像を生成
- **Response:** `image/png`（1200×630px）
- **備考:** Phase 2 で実装検討。初期は投稿写真 or デフォルト画像を og:image に使用

### API-003: Auth Callback（Supabase）

- **Method:** GET
- **Path:** `/auth/callback`
- **認証:** 不要（認証プロセスの一部）
- **処理:** Supabase Auth の PKCE フローで `code` を受け取り、セッション Cookie を設定
- **備考:** Route Handler (`app/auth/callback/route.ts`) として実装

---

