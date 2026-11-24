# REQ-198: 存在しない投稿/依頼 ID のソフト 404 を真の 404 にする

## 背景
ザリダスの投稿詳細 `/post/[id]` と調査依頼詳細 `/request/[id]` は、存在しない（または取得できない）ID にアクセスした場合に、HTTP 404 を返さず**ソフト 404**（HTTP 200 + 「見つかりません」UI）になっている。Next.js のルート metadata は `src/app/layout.tsx:37-40` で `robots: { index: true, follow: true }` を全体既定としているため、これらのソフト 404 ページは `index, follow` を継承し、検索エンジンにインデックスされ得る。

結果として、削除済み・非承認（pending/rejected）・もともと存在しない投稿の URL が、クローラから見ると「正常に存在する 200 ページ」として扱われ、インデックス対象になる。これは SEO 上の問題（無価値ページのインデックス・クロールバジェットの浪費・誤った検索結果）であり、また削除済みコンテンツの URL が生き続ける情報設計上の問題でもある。

対照的に、地域ページ `/area/[municipality]` は未知 slug で `notFound()`（`src/app/area/[municipality]/page.tsx:64`）を呼んでおり、Next.js が `not-found.tsx`（`src/app/not-found.tsx` 経由で `NotFoundPage`）を描画し、404 ステータス + noindex が自動付与される。投稿/依頼ルートだけがこの扱いから外れている。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **投稿詳細が null でも 200 を返し、notFound() を呼ばない**
   - `src/app/post/[id]/page.tsx:40-57` — `getPostForDetail` は取得失敗/未存在で `{ post: null, comments: [], likes: [] }` を返す（48行）。
   - `src/app/post/[id]/page.tsx:63-68` — `generateMetadata` は `if (!post)` で `title: '投稿が見つかりません'` の通常 metadata を返すだけ（`notFound()` を呼ばない / robots を noindex に上書きしない）。
   - `src/app/post/[id]/page.tsx:99-126` — `PostDetailPage` は `post` が null でも `notFound()` を呼ばず、`DetailPageClient` に `initialPost={null}` を渡して描画する（118-123行）。クライアント側 `DetailPage.tsx:156-166` の `if (!post)`「投稿が見つかりません」UI が **HTTP 200** で表示される。
   - 当ルートに `next/navigation` の `notFound` インポートが無い。全体既定 `robots.index: true`（`layout.tsx:38`）を継承するため、`<meta name="robots" content="index, follow">` 相当が出力される（curl 実測で HTTP 200 を確認できる構造）。

2. **調査依頼詳細も同様にソフト 404**
   - `src/app/request/[id]/page.tsx:23-28` — `generateMetadata` は `if (!request)` で `title: '調査依頼が見つかりません'` を返すのみ。`notFound()` を呼ばない。
   - `src/app/request/[id]/page.tsx:58-61` — `SurveyRequestPage`（RSC）は ID の存在検証をせず、常に `SurveyRequestPageClient` を描画する。存在しない ID でもクライアント側「依頼が見つかりません」UI が 200 で表示される。
   - 当ルートにも `notFound` インポートが無い。

3. **削除済み・非承認 URL のインデックス可能性**
   - 上記により、削除された投稿・`pending`/`rejected` で第三者に表示すべきでない投稿・存在しない ID のいずれも、クローラには 200 として応答し、`index, follow` が付くため検索インデックス対象になり得る。

## 目的
存在しない（取得できない）投稿/依頼 ID に対して、`/area/[municipality]` と同様に `next/navigation` の `notFound()` を呼び、HTTP 404 ステータスと共通 `not-found.tsx`（`NotFoundPage`）を返す。これにより 404 ページに noindex が自動付与され、無価値・削除済み URL のインデックスを防ぐ。クライアント側の既存「見つかりません」UI とサーバ 404 の役割を整理する。

## 要件
### 機能要件
- [ ] FR-198-01: `src/app/post/[id]/page.tsx` の `PostDetailPage`（RSC）で、`getPostForDetail` の結果 `post` が null の場合に `next/navigation` の `notFound()` を呼ぶ。これにより 404 + `not-found.tsx` 描画に切り替える。
- [ ] FR-198-02: `src/app/request/[id]/page.tsx` の `SurveyRequestPage`（RSC）で、依頼の存在をサーバ側で確認し（取得用クエリ/RPC を追加、または `generateMetadata` の取得結果を `cache()` で共有して再利用）、未存在時に `notFound()` を呼ぶ。
- [ ] FR-198-03: 投稿の可視性ポリシーに沿って 404 対象を定義する。第三者に表示すべきでない状態（例: `rejected`、または所有者・管理者以外には非表示の `pending`）の投稿を、非所有者の RSC アクセス時に `notFound()` 対象とするかを決定し、現行のクライアント側可視性（`DetailPage`/`page.tsx` の status 制御）と矛盾しないよう実装する。最低限「DB に存在しない ID」は必ず 404 とする。
- [ ] FR-198-04: `notFound()` 導入後、クライアント側の「見つかりません」UI（`DetailPage.tsx:156-166` の `detail.notFound`、`SurveyRequestPage.tsx:122-132` の `survey.notFound`）の役割を整理する。SPA 内遷移など RSC を経由しないケースのフォールバックとして残すか、`not-found.tsx`（`NotFoundPage`）へ寄せるかを明記し、二重メンテにならないようにする。REQ-192（取得失敗のエラー状態）とは区別する（404=存在しない / エラー状態=取得失敗）。
- [ ] FR-198-05: 404 応答時に `index, follow` を継承させない。`notFound()` 経由の `not-found.tsx` 描画で Next.js が 404 を返し noindex 相当になることを基本とし、必要に応じて `not-found.tsx`/`NotFoundPage` 側の metadata（`robots: { index: false }`）も確認・補強する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-198-01: `request` ルートで存在確認のためのクエリを追加する場合、`generateMetadata` と本体での二重取得を避けるため、`/post/[id]` が採用している React `cache()`（`post/[id]/page.tsx:40` 参照）と同様のリクエストスコープ de-dup を用いる。
- [ ] NFR-198-02: 既存の正常系（存在する公開投稿/依頼）のレンダリング・metadata・JSON-LD（`post/[id]/page.tsx:105-113`）を回帰させない。

## 受入条件
- [ ] AC-01: 存在しない投稿 ID へのリクエストが HTTP 404 を返す（ビルド後の `curl -I` 実測、または `notFound` をモックした RSC のユニット/統合テストで `notFound()` 呼び出しを検証）。
- [ ] AC-02: 存在しない依頼 ID へのリクエストが HTTP 404 を返す（同上）。
- [ ] AC-03: 404 応答のレスポンスに `index, follow` が含まれない（noindex 相当である）ことを確認できる（実測手順またはメタデータテスト）。
- [ ] AC-04: 存在する公開投稿/依頼は従来どおり HTTP 200 で詳細が描画され、metadata・JSON-LD が回帰していない（既存テスト + 正常系テスト）。
- [ ] AC-05: `rejected`（および非所有者向け非表示 `pending`）の扱いを FR-198-03 の決定どおりに検証する（決定が「404 にする」なら非所有者アクセスで 404、「200 のまま」なら現行どおりを確認）。
- [ ] AC-06: `area/[municipality]` 既存テスト（`src/app/area/[municipality]/__tests__/page.test.tsx` の notFound 検証パターン）に倣った notFound 呼び出しテストが post/request ルートにも追加されている。

## 影響範囲
- ルート: `src/app/post/[id]/page.tsx`、`src/app/request/[id]/page.tsx`
- 共通: `src/app/not-found.tsx`、`src/views/NotFoundPage.tsx`（noindex/metadata 確認）
- クライアント UI 整理: `src/views/DetailPage.tsx`（156-166行）、`src/views/SurveyRequestPage.tsx`（122-132行）
- 参照パターン: `src/app/area/[municipality]/page.tsx`（notFound 利用）、同 `__tests__/page.test.tsx`
- 全体既定 robots: `src/app/layout.tsx:37-40`
- REQ-192（取得失敗のエラー状態分離）と役割分担を明確化
- 関連テスト: post/request ルートの notFound 統合テスト、404 ステータスの E2E/実測手順

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 削除済み・非承認・存在しない URL がインデックス可能な状態は SEO 品質とクロールバジェットに継続的な悪影響を与え、検索結果に無価値/誤りページが露出し得る。ユーザー機能の破壊は無く、`/area` に既存の正しい実装パターンがあるため低コストで是正できる。緊急の障害ではないため中程度とする。
