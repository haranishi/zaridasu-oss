# REQ-186: cookies() 依存クライアントが ISR を無効化し、読み取り専用ルートが全件動的化している

## 背景
ザリダスの公開ルートのうち、サイトマップ・地域ページ・調査依頼詳細は、ログインセッションに依存しない「RLS で公開された読み取り専用データ」を表示する。これらは REQ-162 で `revalidate`（24時間/1時間/5分）を設定し、Incremental Static Regeneration（ISR）でキャッシュ配信する意図で実装されている。

しかし、これらのルートは Supabase 接続に `src/lib/supabase/server.ts` の `createClient` を使用している。この関数は `await cookies()`（`server.ts:5`）を呼ぶため、Next.js App Router では **Dynamic API の使用**と判定され、`export const revalidate` の指定が無視されてルートが動的化（毎リクエスト SSR 化）される。

対照的に、REQ-176 で追加された `src/app/lp/page.tsx` は cookie 不要の anon クライアント（`@supabase/supabase-js` の `createClient`）を直接使うことで ISR を成立させている（`lp/page.tsx:26-47` のコメントに理由が明記されている）。

## 現状の問題
`cookies()` に依存する `createClient`（`src/lib/supabase/server.ts:5`）を使う読み取り専用ルートで、`revalidate` 指定が無効化され、本来 ISR でキャッシュ配信すべきページが**全リクエスト動的レンダリング**になっている。REQ-162 で意図した「24時間 ISR 化によるサーバー関数実行・Supabase 読み取りの削減」が実機で未達成。

### 該当ルートと `revalidate` 指定
| ルート | `createClient` 使用箇所 | 設定値（無効化されている） |
|---|---|---|
| サイトマップ | `src/app/sitemap.ts:23` | `revalidate = 86400`（`:6`） |
| 地域詳細ページ | `src/app/area/[municipality]/page.tsx:29`（`generateMetadata`）, `:66`（本体） | `revalidate = 86400`（`:19`） |
| 地域一覧ページ | `src/app/area/page.tsx:16` | `revalidate = 3600`（`:7`） |
| 調査依頼詳細 | `src/app/request/[id]/page.tsx:15`（`generateMetadata` のみ） | `revalidate = 300`（`:11`） |

### 影響の具体
- **サイトマップ**: `sitemap.ts` は毎リクエストで `posts`（最大 40,000 行、`:46-51`）・`survey_requests`（最大 5,000 行、`:62-67`）・`user_profiles`（最大 5,000 行、`:78-82`）の 3 クエリを実行する。動的化されているため、クローラーやモニタリングのアクセス毎にこの重いクエリ群が走り、REQ-162 の「日次再構築」が機能していない。
- **地域ページ**: `generateMetadata`（head-count クエリ、`:30-34`）と本体（`limit(50)` の投稿取得、`:68-74`）が、`generateStaticParams`（`:12-14`）で全自治体を事前生成する設計にもかかわらず、`cookies()` 依存により ISR ではなく動的扱いになる。
- **調査依頼詳細**: 本体（`page.tsx:58-61`）はクライアントコンポーネント `SurveyRequestPageClient` を描画するのみで、サーバー側 Supabase アクセスは `generateMetadata`（`:15-22`）の依頼 1 件取得だけ。この 1 箇所の `createClient` が `revalidate = 300` を無効化している。

### 想定される検証結果（実装前提）
- ビルド出力で対象ルートが `ƒ`（Dynamic）表記。`/area/*` が prerender-manifest に載らない。
- `curl -I` で対象ルートのレスポンスが `Cache-Control: private, no-cache, no-store` 系（ISR の `s-maxage` ではない）。

### 参照すべき正しいパターン
`src/app/lp/page.tsx:32-47` の `fetchLpStats` は、`@supabase/supabase-js` の `createClient`（`createAnonClient`、`:2` でインポート）を `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` で直接生成し、`cookies()` を呼ばないため ISR が成立している。`:26-31` のコメントに「`@/lib/supabase/server` は cookies() に依存して静的生成を妨げるため、cookie 不要の anon クライアントを直接使う」と理由が記載されている。

## 目的
読み取り専用の公開ルートを、`cookies()` 非依存の anon クライアントへ差し替え、`export const revalidate` を実効化して ISR を成立させる。`lp/page.tsx` のインライン実装を共通ヘルパーに抽出し、全該当箇所から再利用することで重複と将来のばらつきを防ぐ。サーバー関数実行回数と Supabase 読み取りを REQ-162 の意図どおり削減する。

## 要件
### 機能要件
- [ ] FR-186-01: cookie 非依存の anon Supabase クライアントを生成する共通ヘルパー（例: `src/lib/supabase/anon.ts`）を新設する。`lp/page.tsx:32-47` の生成ロジック（環境変数の存在チェックを含む）を抽出し、`createAnonClient(url, anonKey)` を返す。env 未設定時の扱い（`lp/page.tsx:35` は `null` 返し）を呼び出し側で踏襲できる形にする。
- [ ] FR-186-02: `src/app/sitemap.ts:23` の `await createClient()` を anon ヘルパー利用に置き換える。3 クエリ（`:46-51` / `:62-67` / `:78-82`）の挙動・`warnIfTruncated` の打ち切り警告（`:15-20`）・返却形状は変更しない。
- [ ] FR-186-03: `src/app/area/[municipality]/page.tsx` の `generateMetadata`（`:29`）と本体（`:66`）の `createClient` を anon ヘルパーへ置き換える。head-count クエリ（`:30-34`）と投稿取得（`:68-74`）の結果・`notFound()` 分岐（`:64`）を維持する。
- [ ] FR-186-04: `src/app/area/page.tsx:16` の `createClient` を anon ヘルパーへ置き換える。RPC `get_municipality_post_counts`（`:19`）の呼び出しが anon ロールでも実行可能であることを確認する（不可なら RPC の権限付与、または anon で読める形へ調整）。
- [ ] FR-186-05: `src/app/request/[id]/page.tsx` の `generateMetadata`（`:15`）の `createClient` を anon ヘルパーへ置き換える。依頼 1 件取得（`:17-22`）と「見つからない」分岐（`:23-28`）を維持する。
- [ ] FR-186-06: 置き換える各ルートが参照するデータが「RLS で anon（未ログイン）でも読める公開データのみ」であることを前提として明記し、コード上でも担保する。`posts`（`status='approved'`）・`survey_requests`（公開 `status`）・`user_profiles`（`is_public=true`）・`get_municipality_post_counts` が anon で読めることを確認する。読めない列・行が混じる場合は anon 化しない。
- [ ] FR-186-07: 既存の `src/lib/supabase/server.ts` の `createClient`（cookie 依存）は、認証セッションが必要なルート（ユーザー固有データ・書き込み）向けに**残す**。本 REQ では読み取り専用ルートのみを差し替える。

### 非機能要件（該当する場合のみ）
- [ ] NFR-186-01: anon 化後も RLS が真の防衛線として機能し、非公開データ（未承認投稿・非公開プロフィール等）がサイトマップ・地域ページ・依頼詳細経由で漏洩しないこと。
- [ ] NFR-186-02: ISR 成立により、対象ルートの Vercel 関数実行回数と Supabase 読み取りが、`revalidate` 期間あたり原則 1 回（再生成時）に収束すること。

## 受入条件
- [ ] AC-01: `next build` の出力で、`/sitemap.xml`・`/area`・`/area/[municipality]`・`/request/[id]` が動的（`ƒ`）ではなく静的/ISR（`○` または `●`、`Revalidate` 列に値あり）として表記される。
- [ ] AC-02: ビルド成果物の prerender-manifest に、`generateStaticParams` で生成される `/area/*` のエントリが生成される。
- [ ] AC-03: デプロイ後（または `next start`）の対象ルートへの `curl -I` が、`Cache-Control: private, no-cache, no-store` ではなく、ISR を示す `s-maxage`/`stale-while-revalidate` を含むヘッダーを返す。
- [ ] AC-04: 未ログイン状態で各ルートを取得しても、表示内容が現状（公開データのみ）と一致し、非公開データが露出しない。
- [ ] AC-05: anon ヘルパーが `lp/page.tsx` からも利用され（インライン実装の重複が解消され）、`next build` と型チェックがエラーなく完了する。

## 影響範囲
- 新規: `src/lib/supabase/anon.ts`（共通 anon クライアントヘルパー）
- `src/app/sitemap.ts`（`:23`）
- `src/app/area/[municipality]/page.tsx`（`:29`, `:66`）
- `src/app/area/page.tsx`（`:16`）
- `src/app/request/[id]/page.tsx`（`:15`）
- `src/app/lp/page.tsx`（`:32-47` を共通ヘルパー利用へリファクタ）
- DB/権限（`get_municipality_post_counts` RPC の anon 実行可否、各テーブルの anon RLS）
- `src/lib/supabase/server.ts`（変更なし。用途の住み分けを明記）

## 優先度
- **緊急度**: 高 / **重要度**: 高 / **理由**: REQ-162 で実装したはずの ISR が全該当ルートで未達という「実装と挙動の乖離」。特にサイトマップは毎クローラーアクセスで最大 5 万行規模の 3 クエリを実行しており、Supabase 読み取りと Vercel 関数実行のコスト・レイテンシに直結する。修正パターン（`lp/page.tsx`）が既に確立しており、横展開で確実かつ低リスクに是正できる。
