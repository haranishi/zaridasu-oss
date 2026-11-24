# REQ-037: RSC で SSR 用 Supabase クライアントに統一

## 背景
Next.js 15 App Router + Supabase SSR 構成では、React Server Components（RSC）およびメタデータ／サイトマップ／静的パラメータ生成関数から Supabase を呼び出す際、公式推奨は `@/lib/supabase/server` に実装した cookie ベースの `createClient()`（`@supabase/ssr`）を使うことである。これによりリクエスト単位のクッキーが渡り、RLS が正しく評価される。プロジェクトの他の RSC（`src/app/post/[id]/page.tsx:2` / `src/app/profile/[userId]/page.tsx:2` / `src/app/request/[id]/page.tsx:2`）は既にこの方針に従っているが、一部ファイルが古い `@supabase/supabase-js` の `createClient` を直接使用しており不整合。

## 現状の問題
- `src/app/area/[municipality]/page.tsx:3` / `:26` / `:66` `@supabase/supabase-js` の `createClient` を直接使っており、クッキーが渡らない anon 固定クライアントになっている。

  ```ts
  import { createClient } from '@supabase/supabase-js'
  // ...
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  ```

- `src/app/area/page.tsx:2` / `:16` 同上。

  ```ts
  import { createClient } from '@supabase/supabase-js'
  // ...
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  ```

- `src/app/sitemap.ts:2` / `:8` 同上。

  ```ts
  import { createClient } from '@supabase/supabase-js'
  // ...
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  ```

- 結果として、RSC 全体で `approved` 以外のデータを RSC で扱う将来の変更で RLS が期待通りに効かない／キャッシュ挙動が `cookies()` を読まないために意図せずずれる、などの潜在バグが生じる。

## 目的
- RSC 層の Supabase クライアント生成を `@/lib/supabase/server` に集約し、プロジェクト全体で「RSC = server client」「Route Handler / Server Action = server client」「ブラウザ = browser client」の 3 分類に統一する。

## 要件

### 機能要件
- [ ] FR-037-01: 以下 3 ファイルの `import { createClient } from '@supabase/supabase-js'` を削除し、`import { createClient } from '@/lib/supabase/server'` に差し替える。
  - `src/app/area/[municipality]/page.tsx`
  - `src/app/area/page.tsx`
  - `src/app/sitemap.ts`
- [ ] FR-037-02: `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)` 呼び出しを `await createClient()` に書き換える（サーバー実装は内部で env と cookies を解決する）。
- [ ] FR-037-03: env 未設定（ビルド環境での変数欠落）時に `generateStaticParams` / `generateMetadata` / `sitemap` がクラッシュしないよう、server client の `createClient` 内部で env 未設定時に例外を投げる設計であれば try/catch で早期 return（空配列や最小メタデータ）する。
- [ ] FR-037-04: `src/app/` 配下で `@supabase/supabase-js` の value import（`createClient` など）が残っていないこと。型 import（`import type { ... }`）のみ許容。

### 非機能要件
- [ ] NFR-037-01: 変更後も `/area` / `/area/[municipality]` / `/sitemap.xml` のレスポンスボディが既存と機能的に等価であること（件数・並び・URL 数）。

## 受入条件
- [ ] AC-01: `pnpm build`（または `npm run build`）が警告・エラーなく成功する。
- [ ] AC-02: `/sitemap.xml` が従来通り static / area / post / request / profile の URL を含む。
- [ ] AC-03: `/area` が市区町村別投稿数を従来通り表示する。
- [ ] AC-04: `/area/[municipality]` が承認済み投稿を 50 件まで取得して地図・統計を表示する。
- [ ] AC-05: `grep -rn "from '@supabase/supabase-js'" src/app` の結果が空、もしくは `import type` のみである。

## 影響範囲
- 変更対象ファイル
  - `src/app/area/[municipality]/page.tsx`
  - `src/app/area/page.tsx`
  - `src/app/sitemap.ts`
- 参照（変更不要）
  - `src/lib/supabase/server.ts`
  - `src/app/post/[id]/page.tsx` / `src/app/profile/[userId]/page.tsx` / `src/app/request/[id]/page.tsx`（既に server client 使用）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 現時点では approved データのみ扱うため直接の不具合はないが、SSR の一貫性を欠き将来のリグレッション温床になるため、早めに統一しておく価値が高い。

