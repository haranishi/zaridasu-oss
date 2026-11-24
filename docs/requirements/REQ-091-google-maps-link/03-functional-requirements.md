## 機能要件

### FR-091-01: OpenInGoogleMapsButton 共通コンポーネント
- **配置:** `src/components/common/OpenInGoogleMapsButton.tsx`
- **Props:**
  ```ts
  interface OpenInGoogleMapsButtonProps {
    lat: number
    lng: number
    label?: string                    // 既定: 'Google Maps で経路を表示'
    mode?: 'search' | 'directions'    // 既定: 'directions'
    travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit'  // 既定: 'driving'
    className?: string                // 親側で見た目調整できるよう
  }
  ```
- **処理:**
  1. `mode === 'search'` なら `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`
  2. `mode === 'directions'` なら `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=<travelMode>`
  3. `<a target="_blank" rel="noopener noreferrer" aria-label={label}>` でアンカー要素として描画
- **バリデーション:**
  - `lat`, `lng` が `Number.isFinite` を満たすこと。NaN / Infinity / null の場合はボタンを描画しない（`return null`）
  - `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]` の範囲チェック。範囲外なら描画しない
- **エラーハンドリング:**
  - 不正な座標時は描画しない（コンソール警告も不要、サイレント）

### FR-091-02: SurveyRequestPage への組み込み
- **配置:** `src/views/SurveyRequestPage.tsx` の `MiniMap` 直下、または「ステータス + メタ」カードの中（座標表示の近く）
- **推奨配置:** `MiniMap` を含む div の直後に小さな帯として挿入
  ```
  <div className="h-48 sm:h-56"><MiniMap ... /></div>
  <div className="px-4 -mt-2">
    <OpenInGoogleMapsButton lat={request.lat} lng={request.lng} />
  </div>
  ```
- **既存への影響:** 純粋に追加のみ。既存ボタン（協力する / 結果を投稿する / クローズ）は変更しない

### FR-091-03: DetailPage への組み込み
- **配置:** `src/views/DetailPage.tsx` の地図カード内、座標表示テキストの直後
- **推奨配置:**
  ```
  <div className={card}>
    <h3>...{t('detail.foundAt')}...</h3>
    <div className="h-64 rounded-xl overflow-hidden">
      <DetailMap lat={post.lat} lng={post.lng} />
    </div>
    <p className="text-xs mt-2">...座標...</p>
    <OpenInGoogleMapsButton lat={post.lat} lng={post.lng} className="mt-3" />
  </div>
  ```
- **既存への影響:** 純粋に追加のみ。CommentSection / LikeShareSection は変更しない

### FR-091-04: URL 仕様の統一
- **検索モード（位置を表示）:**
  - URL: `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`
  - 用途: ピンを立てて周辺の地形を確認したいだけ
- **経路モード（経路を表示）:**
  - URL: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=<mode>`
  - 用途: 現在地から目的地までナビゲーション
  - travelmode は既定 `driving`（運転）。歩きたい / 自転車派は Google Maps 側で切替可
- **既定モード:** `directions`（より具体的に役立つため）

### FR-091-05: 文字列のサニタイズと数値整形
- 緯度経度は `Number.toFixed(6)` で小数 6 桁に丸めてから URL に埋める（精度: 約 11cm。位置情報過剰公開を避ける既存ポリシーに合致）
- URL エンコード必須（数値とカンマのみのため実害は出ないが、将来文字列が混入した時のため `encodeURIComponent` を通す）
- ハードコード文字列 `'Google Maps で経路を表示'` は i18n キー `t('common.openInGoogleMaps')` 等で将来差し替え可能にしておく（初期はハードコード可）

---
