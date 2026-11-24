## 背景

`react-leaflet` 系（`MapContainer` / `TileLayer` / `Marker` / `CircleMarker` 等）と `leaflet` 本体は、モジュール評価時に `window` を参照する。そのため SSR を避ける目的で各「ページ側」では既に `next/dynamic({ ssr: false })` で wrap されている（`HomeInteractive` の `PostForm` / `SurveyRequestForm`、`SurveyRequestPage` の `MiniMap`、`ReviewCard` の `ReviewCardMiniMap`）。

しかし **wrap された側のコンポーネント内部では `react-leaflet` を静的 import している**ため、

1. 動的 chunk の中で leaflet 一式 (Leaflet + react-leaflet + 関連 CSS 副作用) が必ずバンドルされる
2. PostForm → LocationSection / SurveyRequestForm → 内蔵 MapContainer のように二重 wrap が発生し、コード分割粒度が荒い
3. 録音時にのみ必要な `fix-webm-duration` (`src/lib/audio/fixWebmDuration.ts`) も同様に静的 import されており、AudioRecorder を読み込む経路すべてに含まれる

REQ-026 / REQ-046 / REQ-111 / REQ-124 で部分的な対策は入っているが、`LocationSection` / `MiniMap` / `ReviewCardMiniMap` / `SurveyRequestForm` 内の `react-leaflet` 静的 import と `fixWebmDuration.ts` の `fix-webm-duration` 静的 import は未対応。本要件で潰す。

## 現状の問題

### 1. `src/components/modals/SurveyRequestForm.tsx:4`
```ts
import { MapContainer, TileLayer } from 'react-leaflet'
```
- 呼び出し元（HomeInteractive / SurveyRequestsListPage）は `dynamic({ ssr: false })` だが、SurveyRequestForm の chunk に leaflet 一式が常時バンドルされる。
- SurveyRequestForm を開く瞬間に取得する chunk が肥大化。

### 2. `src/components/features/posts/LocationSection.tsx:2`
```ts
import { MapContainer, TileLayer } from 'react-leaflet'
```
- PostForm の chunk に直に leaflet が含まれる（PostForm も dynamic だが、PostForm 内側の遅延化粒度が荒い）。

### 3. `src/components/features/map/MiniMap.tsx:3`
```ts
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
```
- `SurveyRequestPage.tsx:9` で `dynamic` wrap されているが MiniMap 内部の `react-leaflet` 静的 import で個別表示時に leaflet が必ず取得される。
- MiniMap は presentational なため、コンポーネント内部で dynamic 化しておけば「地図 visible になった時のみ leaflet を取得」に最適化できる。

### 4. `src/components/features/admin/ReviewCardMiniMap.tsx:2`
```ts
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
```
- 親 `ReviewCard.tsx:11` で `dynamic(() => import('./ReviewCardMiniMap'), { ssr: false })` 済み（コミット `5cbcf30`）。
- すでに「カードのレンダリングまで遅延」されているため、初期バンドルへの影響は小さい。
- 一方で IntersectionObserver でビューポートに入った時のみ表示しているのに、`react-leaflet` モジュール自体は ReviewCardMiniMap が読み込まれた瞬間に確保される。`visible` 切替時にだけ react-leaflet を取得する形にすれば、`/admin/posts` で多数のレビューカードが並んでも leaflet 取得を 1 回で済ませられる。
- **対応の必要性は実測で判定**：bundle-analyzer で ReviewCardMiniMap chunk のサイズが許容範囲であれば NoOp とする。

### 5. `src/lib/audio/fixWebmDuration.ts:5`
```ts
import fixWebmDuration from 'fix-webm-duration'
```
- 呼び出し箇所は `src/components/features/posts/AudioRecorder.tsx:183` の 1 箇所のみ。
- AudioRecorder が import されると `fix-webm-duration` も同 chunk にバンドルされる。
- 録音ボタン押下後の `recorder.onstop` ハンドラ内のみで使うため、`await import('fix-webm-duration')` で十分。録音時間（数秒〜十秒）以内なら遅延 import の待ち時間（数十 ms）は許容範囲。

### 6. 静的 import に伴う bundle 計測の不確実性
- `react-leaflet` + `leaflet` + `leaflet.markercluster` + `react-leaflet-cluster` の合計サイズは gzip で 50〜100 KB 級（次節「期待効果」参照）。
- 現状 size-limit はチャンク単位 (`.size-limit.json`) で監視しているが、二次チャンク（PostForm / SurveyRequestForm / MiniMap）の上限は未設定。
