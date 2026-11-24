## 機能要件

### FR-085-01: 一覧ページのルーティング
- **説明:** Next.js App Router で `/requests` を新規追加
- **入力:** クエリパラメータ `?status=`, `?municipality=`, `?species=`, `?sort=`, `?owner=me`
- **処理:**
  1. `src/app/requests/page.tsx`（Server Component の薄いラッパ）から `<SurveyRequestsListPage />` を返す
  2. クライアント側で `useSurveyRequests(filters)` を呼び出し
  3. URL クエリと state を双方向に同期（`useSearchParams` + `router.replace`）
- **出力:** クライアント rendered な一覧 UI

### FR-085-02: フィルタコンポーネント
- **説明:** 上部に固定（モバイル）/ サイドバー（PC）でフィルタを配置
- **項目:**
  - status: `all | open | responded | closed`（デフォルト: open + responded）
  - species: `all | bullfrog | american | unknown`
  - municipality: 秋田県の市区町村リストから選択（既存 `useReverseGeocode` 等で使われる定数）
  - sort: `newest | urgentFirst`
  - owner: `me`（ログイン時のみ）
- **a11y:** 各 `<select>` に `<label>` と `htmlFor` を付与、`aria-live="polite"` で件数読み上げ

### FR-085-03: カード UI
- **説明:** 既存 `SurveyRequestPage.tsx` のステータスバッジ / 種別 / 市区町村 / 緊急度のスタイルを踏襲したカード
- **要素:**
  - 種別アイコン + 種別名
  - 市区町村 + 経過時間（date-fns `formatDistanceToNowStrict`）
  - 緊急度バッジ（urgent のみ赤）
  - status バッジ（open=amber / responded=blue / closed=gray）
  - 応答数（Phase 3 後に実値）
  - reason の冒頭 60 文字を line-clamp-2 で表示
- **動線:** カード全体が `<Link href="/request/[id]">`

### FR-085-04: 既存 hook の filter 拡張
- **説明:** `useSurveyRequests` を破壊的変更せず、引数に `owner?: 'me' | undefined` を追加
- **処理:** owner === 'me' の場合 `auth.uid() = user_id` でフィルタ（クライアント側で user.id を当てて `.eq('user_id', user.id)`）
- **互換性:** 既存呼び出しは引数省略のため挙動不変

### FR-085-05: 空状態 / エラー状態
- **説明:** 0 件 / フィルタヒットなし / fetch エラー時のフォールバック UI
- **挙動:**
  - 0 件: 「まだ依頼がありません」+「依頼を立てる」CTA（地図ページへ）
  - フィルタヒットなし: 「条件に合う依頼がありません」+ フィルタリセットボタン
  - fetch error: トーストでエラー表示 + 再試行ボタン

---
