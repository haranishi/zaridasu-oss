# REQ-155: 危険な型キャスト (as unknown as) の排除と検証導入

## 背景
ザリダス (Next.js 15 + Supabase, TypeScript) では、Supabase クエリ結果やランタイム値を特定の型に変換する際に `as unknown as T` という二段キャストや、Proxy 経由のキャストが複数箇所で使われている。`as unknown as T` は TypeScript の型チェックを完全にバイパスするため、実データと型が乖離していてもコンパイル時に検知できず、実行時の不整合 (undefined アクセス等) を招くリスクがある。

## 現状の問題
以下の各箇所で、検証を伴わない強制キャストが行われている。

### 1. Supabase クライアント Proxy のキャスト
`src/lib/supabase/client.ts:30-34` — lazy 初期化 Proxy の `get` ハンドラで、`createClient()` の戻り値 (`SupabaseClient`) を `Record<string | symbol, unknown>` にキャストして任意プロパティを取り出している。
```ts
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (createClient() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
```
`SupabaseClient` を任意キーのレコードとして扱うため、Proxy 越しのプロパティアクセスは型保証を失う。

### 2. AdminPostsPage の投稿一覧キャスト
`src/views/admin/AdminPostsPage.tsx:88` — 列を絞って取得した結果 (`ADMIN_POSTS_LIST_COLUMNS` 指定) を `AdminPost[]` へ二段キャストしている。
```ts
// REQ-142: 列指定により取得列が AdminPost のサブセットになるため明示キャストする。
// 参照側のコードは列リストの範囲内でのみ動作することをレビューで担保する。
setPosts((data ?? []) as unknown as AdminPost[])
```
コメントの通り「参照側がレビューで担保」という運用前提に依存しており、型では保証されていない。

### 3. MyPostsSection のマイ投稿キャスト
`src/components/features/dashboard/MyPostsSection.tsx:80` — 列を明示指定して取得した投稿を `MyPost[]` へ二段キャストしている。
```ts
setMyPosts((data as unknown as MyPost[]) || [])
```
`MyPost` は `Post & { status?, ai_result?, ... }` (同ファイル `:25-49`) の拡張型だが、取得列 (`:75`) との一致は型で保証されていない。

### 4. useProfile のバッジ定義キャスト
`src/hooks/useProfile.ts:128` — `badge_definitions` から `id, name, description, icon, sort_order` を取得した結果を `BadgeDefinition[]` へ二段キャストしている。
```ts
.then(({ data }) => { if (data) setBadges(data as unknown as BadgeDefinition[]) })
```
取得列に `icon` が含まれる一方、`BadgeDefinition` (同ファイル `:109-116`) のフィールドは `emoji` を持つなど列名とのズレが存在し、二段キャストにより実体と型のミスマッチが隠蔽されている。

### 影響
- `as unknown as T` はコンパイル時の安全網を無効化するため、Supabase の select 列変更・スキーマ変更時に型エラーが出ず、`undefined` フィールドへのアクセスがランタイムまで露見しない。
- Proxy のキャストはクライアント全 API 呼び出しの基盤であり、型保証が抜けると広範囲に波及する。

## 目的
- 検証を伴わない `as unknown as T` を、Zod 等によるランタイム検証、またはジェネリックで型付けされた安全な取得方式に置き換え、データと型の一致を保証する。
- Proxy 経由のクライアントアクセスでも `SupabaseClient` の型情報を可能な限り保持する。

## 要件
### 機能要件
- [ ] FR-155-01: Supabase の select 結果 (`AdminPostsPage.tsx:88`, `MyPostsSection.tsx:80`, `useProfile.ts:128`) について、以下のいずれかで型安全性を回復する。
  - (a) Zod スキーマを定義し、取得結果を `parse` / `safeParse` して検証済みの型を得る。
  - (b) Supabase クエリのジェネリック型指定や、取得列に対応した正確な型 (Pick した部分型) を用い、`as unknown as` を排除する。
- [ ] FR-155-02: `BadgeDefinition` (`useProfile.ts:109-116`) のフィールド名と実取得列 (`id, name, description, icon, sort_order`) の不整合 (`emoji` vs `icon`) を解消し、列と型を一致させる。
- [ ] FR-155-03: `src/lib/supabase/client.ts:30-34` の Proxy について、`Reflect.get(createClient(), prop)` 等の型保持しやすい実装へ見直し、`as unknown as Record<...>` を不要にできないか検討する。困難な場合はキャスト範囲を最小化し、理由をコメントで明記する。

### 非機能要件（該当する場合）
- [ ] NFR-155-01: Zod を導入する場合、検証はクライアント取得直後の単一箇所に集約し、検証失敗時のフォールバック（空配列 / エラー表示）を定義する。
- [ ] NFR-155-02: 変更後も既存の画面表示・データ取得挙動が変わらないこと（リグレッションなし）。

## 受入条件
- [ ] AC-01: `AdminPostsPage.tsx:88`、`MyPostsSection.tsx:80`、`useProfile.ts:128` から `as unknown as` が排除される（または検証付き変換に置換される）。
- [ ] AC-02: `badge_definitions` の取得列と `BadgeDefinition` 型のフィールド名が一致する。
- [ ] AC-03: 取得列を増減させると型エラー、または検証エラーで検知できる（型の安全網が機能する）。
- [ ] AC-04: `tsc --noEmit` とビルドが成功し、対象画面（管理投稿一覧 / ダッシュボードのマイ投稿 / プロフィールバッジ）が従来通り表示される。

## 影響範囲
- `src/lib/supabase/client.ts`
- `src/views/admin/AdminPostsPage.tsx`
- `src/components/features/dashboard/MyPostsSection.tsx`
- `src/hooks/useProfile.ts`
- （Zod 導入時）依存追加と検証スキーマ定義ファイル

## 優先度
- **緊急度**: 中 / **重要度**: 高 / **理由**: 二段キャストは型システムを無効化し、Supabase スキーマ・select 列の変更時にランタイムエラーを誘発する。Proxy キャストはクライアント基盤に位置するため影響範囲が広い。実行中の明確なバグではないが、保守性・型安全性を継続的に損なう。
