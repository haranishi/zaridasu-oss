## 3. 機能要件

### FR-092-01: HomePage の RSC 化（部分）
- **説明**：`src/app/(home)/HomePageClient.tsx` の `'use client'` re-export を廃止し、ヘッダー / フッター / 静的 CTA / SEO 用構造化データを Server Component 化する。地図やフィルタなど動的部品のみ Client Component に閉じ込める。
- **入力**：なし（ルーティング上はそのまま）。
- **処理**：
  1. `src/app/(home)/page.tsx` を Server Component のまま維持し、`<HomePageShell>`（RSC）の中に Client な `<HomeInteractive>` を入れる構成に分解。
  2. 地図 / 投稿フォーム / モーダル等を Client 側に集約。
  3. データの初期取得を Server 側 `createServerClient` で行い、RSC props として Client に渡す。
- **出力**：HTML が SSR で先に届き、地図 hydration までの白画面が短縮される。
- **バリデーション**：
  - `'use client'` を持つコンポーネントが本当にブラウザ API（window / IndexedDB / Leaflet）に依存しているか棚卸し。
- **エラーハンドリング**：
  - Server 側 fetch 失敗時は `error.tsx` boundary（既存）で受ける。

### FR-092-02: 重いコンポーネントの dynamic import 拡大
- **説明**：現状 `MapView`、`PostForm`、`SurveyRequestForm` のみ dynamic。さらに `EditDialog` / `ReportModal` / `DeleteDialog` / `AuthModal` / `AudioRecorder` / `PhotoGallery` 等のモーダル系を `dynamic({ ssr: false })` 化する。
- **入力**：なし。
- **処理**：
  - 開閉トリガー（ボタン押下）時に初めて bundle 取得。
  - `loading` プロパティで軽量スケルトン表示。
- **出力**：HomePage の First Load JS から 30〜50KB 削減見込み。
- **バリデーション**：dynamic 化後も SSR で必要な型 / 定数のみ別ファイル化して直 import する。
- **エラーハンドリング**：dynamic chunk 取得失敗時は再試行ボタン付きフォールバック。

### FR-092-03: leaflet.heat / react-leaflet-cluster の遅延化（REQ-026）
- **説明**：`import 'leaflet.heat'` のサイドエフェクト import を削除し、ヒートマップ表示時にのみ動的 import。Leaflet CSS の重複 import を集約。
- **入力**：ユーザーがヒートマップを ON にしたとき。
- **処理**：`useEffect` 内で `await import('leaflet.heat')`、その後 heatLayer を attach。
- **出力**：ホーム初期 bundle から 15〜30KB 削減。
- **詳細仕様**：REQ-026 を参照。

### FR-092-04: 画像最適化（REQ-022 / REQ-041）
- **説明**：投稿一覧 / プレビュー / 編集ダイアログの全 `<img>` を `next/image` に置換。`toThumbnailUrl()` を活用。AVIF/WebP 自動配信。
- **入力**：投稿レコードの画像 URL。
- **処理**：
  1. 一覧では Supabase Storage transform 経由でサムネイル URL を生成。
  2. 詳細ではフル解像度を `loading="lazy"` で配信。
  3. 全箇所で `width` / `height` を必須化し CLS=0 を担保。
- **出力**：LCP / 帯域削減。
- **詳細仕様**：REQ-022 / REQ-041 参照。

### FR-092-05: Supabase クエリ最適化（REQ-032 / 拡張）
- **説明**：
  - 列指定（`select('id, created_at, ...')`）の徹底。
  - useStats / sitemap / dashboard を集約 RPC または COUNT GROUP BY に置換。
  - PostgREST の `embeds`（外部キー JOIN）で N+1 を解消。
- **新規**：本 REQ で `select('*')` の使用箇所を全件棚卸しする（タスク T-09）。
- **詳細仕様**：REQ-032 + 本書のチェックリスト。
