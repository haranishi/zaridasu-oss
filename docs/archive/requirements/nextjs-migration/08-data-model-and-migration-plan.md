## Step 7: データモデル・DB 設計

### 既存スキーマの維持

DB スキーマは変更しない。既存テーブル構成をそのまま継続利用する。

#### テーブル一覧

| テーブル | 説明 | RLS |
|---------|------|-----|
| `posts` | 投稿データ（種類・位置・写真・AI結果） | 承認済みは公開、所有者は編集可、管理者は全操作可 |
| `comments` | 投稿へのコメント | 公開閲覧、認証ユーザーが投稿可、所有者が削除可 |
| `likes` | いいね（投稿×ユーザーでユニーク） | 公開閲覧、認証ユーザーが操作可 |
| `reports` | 通報 | 匿名投稿可、管理者が閲覧・解決 |
| `audit_logs` | 管理者操作ログ | 管理者のみ閲覧 |
| `user_profiles` | ユーザープロフィール・バッジ | 公開プロフィールは閲覧可、自分のみ編集可 |
| `badge_definitions` | バッジ定義マスター | 全員閲覧可 |
| `user_badges` | ユーザー獲得バッジ | 全員閲覧可 |
| `survey_requests` | 調査依頼 | 全員閲覧可、認証ユーザーが作成可 |

#### ER 図（テキスト表現）

```
[auth.users] 1──1 [user_profiles]
     |
     ├── 1──N [posts]
     │          ├── 1──N [comments]
     │          ├── 1──N [likes]
     │          └── 1──N [reports]
     │
     ├── 1──N [user_badges] N──1 [badge_definitions]
     │
     ├── 1──N [survey_requests]
     │          └── 1──N [posts] (survey_request_id)
     │
     └── 1──N [audit_logs]
```

---

## Step 8: マイグレーション計画

### DB マイグレーション

なし（既存スキーマを変更しない）

### コード移行計画

#### Migration-001: プロジェクト初期セットアップ
- **内容:** Next.js 15 プロジェクト作成、Tailwind CSS 設定、基本ディレクトリ構成
- **影響:** 新規ファイル作成のみ、既存コードへの影響なし

#### Migration-002: Supabase クライアント分離
- **内容:** `@supabase/ssr` 導入、サーバー/クライアント用クライアント作成
- **影響:** `src/lib/supabase.js` → `lib/supabase/server.ts` + `lib/supabase/client.ts`

#### Migration-003: 共通レイアウト・プロバイダー移植
- **内容:** `app/layout.tsx` にルートレイアウト、Context Providers、フォント設定
- **影響:** `src/main.jsx` + `src/App.jsx` → `app/layout.tsx`

#### Migration-004: 静的ページ移植
- **内容:** About, Terms, Privacy, NotFound, Offline ページを SSG として移植
- **影響:** 5ページ、コンポーネントの `'use client'` 不要部分が多い

#### Migration-005: 認証フロー移植
- **内容:** Middleware + Auth Callback Route Handler + AuthContext
- **影響:** 認証の仕組みが Cookie ベースに変更（Supabase SSR 方式）

#### Migration-006: 投稿詳細ページ（SSR + SEO）
- **内容:** `/post/[id]` を Server Component + `generateMetadata` で実装
- **影響:** SEO 改善の最重要ページ、CommentSection・LikeSection は Client Component

#### Migration-007: トップページ移植
- **内容:** Server Component（初期データ取得）+ Client Components（地図・フィルター・フォーム）
- **影響:** 最も複雑なページ、useReducer による UI 状態管理の移植が必要

#### Migration-008: 残りのページ移植
- **内容:** Dashboard, Trends, Ranking, Profile, SurveyRequest, Admin ページ
- **影響:** Dashboard・Admin は Client Only、Trends・Ranking は ISR

#### Migration-009: PWA 対応
- **内容:** `next-pwa` 設定、Service Worker、マニフェスト、オフラインキュー
- **影響:** `vite-plugin-pwa` → `next-pwa` への置き換え

#### Migration-010: 最終テスト・パフォーマンス最適化
- **内容:** E2E テスト、Lighthouse 検証、バンドルサイズ最適化
- **影響:** 全ページの動作確認

---

