# REQ-004: 存在しない /api/prerender ルートへの参照（Dead Route）

## 背景
ルートの `middleware.js` がボットクローラー向けのプリレンダリング処理として `/api/prerender` エンドポイントを参照しているが、該当するAPIルートが実装されていない。

## 現状の問題
- `middleware.js:20` — ボットUA検出時に `/api/prerender?id=...` へ fetch している:
  ```javascript
  const prerenderUrl = new URL(`/api/prerender?id=${encodeURIComponent(id)}`, request.url)
  ```
- `src/app/api/` 配下には `og/route.tsx` のみが存在し、`prerender/route.ts` は存在しない:
  ```
  src/app/api/
  └── og/
      └── route.tsx    ← OGP画像生成用（存在する）
  // prerender/ は存在しない
  ```
- `middleware.js:22-36` — fetch が実行されると404レスポンスが返り、その HTML がそのままボットに返却される。try-catch はあるが、`response.ok` チェックがないため 404 HTML をボットに返す:
  ```javascript
  try {
      const response = await fetch(prerenderUrl.toString())
      const html = await response.text()  // 404ページのHTMLがそのまま返る
      return new Response(html, { status: response.status, ... })
  } catch {
      return  // fetch自体の例外のみキャッチ
  }
  ```

### 影響
1. Googlebot, Twitter/X crawler, Facebook crawler, Slack, Discord 等のボットが `/post/:id` にアクセスすると、404ステータスのレスポンスが返却される
2. OGPプレビュー（SNSでのリンク共有時のカード表示）が正常に機能しない
3. SEOに悪影響：ボットが404を受け取るため、投稿詳細ページがインデックスされない可能性がある
4. ボットリクエストのたびに無駄な内部 fetch が発生するパフォーマンス問題

## 目的
middleware のプリレンダリング機能を正常に動作させるか、実装予定がない場合はデッドコードを除去する。

## 要件

### 機能要件（選択肢A: プリレンダリング実装）
- [ ] FR-004-A01: `src/app/api/prerender/route.ts` を新規作成し、投稿IDに基づくOGPメタタグ付きHTMLを返すAPIルートを実装する
- [ ] FR-004-A02: Supabaseから投稿データを取得し、title/description/og:image 等のメタタグを含むHTMLを生成する
- [ ] FR-004-A03: `middleware.js` に `response.ok` チェックを追加し、非200レスポンス時はSPAフォールバックに戻す

### 機能要件（選択肢B: デッドコード除去）
- [ ] FR-004-B01: `middleware.js` を削除する（または空の matcher に変更する）
- [ ] FR-004-B02: Next.js の既存メタデータ機能（`generateMetadata`）やOG画像APIルート (`src/app/api/og/route.tsx`) でボットクローラー対応を行う
- [ ] FR-004-B03: 投稿詳細ページ（`/post/[id]`）に適切な `generateMetadata` を実装し、SSR/ISRでOGPタグをレンダリングする

### 非機能要件
- [ ] NFR-004-01: ボットクローラーが `/post/:id` にアクセスした際、200ステータスで適切なOGPメタタグを含むHTMLが返却されること
- [ ] NFR-004-02: 通常ユーザー（非ボット）のアクセスに影響がないこと

## 受入条件
- [ ] AC-01: `/post/:id` のURLをTwitter/XのCard Validatorでテストし、正しいOGPプレビューが表示されること
- [ ] AC-02: `/post/:id` のURLをFacebook Sharing Debuggerでテストし、正しいOGPプレビューが表示されること
- [ ] AC-03: ボットUA以外の通常リクエストで `/post/:id` にアクセスすると、通常のSPA/SSRページが表示されること
- [ ] AC-04: 存在しない投稿IDでアクセスした場合、適切な404レスポンスが返ること
- [ ] AC-05: middleware 内で未実装のAPIルートへの fetch が発生しないこと

## 影響範囲
- `middleware.js`（ルート） — 修正または削除
- `src/app/api/prerender/route.ts` — 新規作成（選択肢Aの場合）
- `src/app/post/[id]/page.tsx` — `generateMetadata` 追加（選択肢Bの場合）
- `next.config.ts` — middleware設定の確認

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: ボットクローラーに404が返却されるため、SNSでのリンク共有時にOGPプレビューが表示されず、SEOにも悪影響を与えている。ユーザーの投稿共有体験に直接影響する。
