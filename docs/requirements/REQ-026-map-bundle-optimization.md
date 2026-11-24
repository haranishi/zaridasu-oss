# REQ-026: 地図関連バンドルの最適化

## 背景
地図コンポーネントは Leaflet + react-leaflet + react-leaflet-cluster + leaflet.heat で構成され、合計100KB以上のバンドルサイズを占める。ヒートマップ用の `leaflet.heat` はサイドエフェクトimportで常時バンドルに含まれ、Leaflet CSS も複数コンポーネントで重複インポートされている。

## 現状の問題
- `src/components/features/map/MapView.tsx:8`: `import 'leaflet.heat'` がサイドエフェクトimportで常時バンドルに含まれる（~15KB）
- `src/components/features/map/MapView.tsx:2-3`: `react-leaflet-cluster` がトップレベルimport（~50KB+）
- Leaflet CSS が3箇所で重複import:
  - `src/components/features/map/MapView.tsx:7`
  - `src/components/features/map/MiniMap.tsx:5`
  - `src/components/features/admin/ReviewCardMiniMap.tsx`

## 目的
地図関連の不要なバンドルサイズを削減し、初回ページロードのパフォーマンスを改善する。

## 要件

### 機能要件
- [ ] FR-026-01: `leaflet.heat` を動的import（`import()`）に変更し、ヒートマップ表示時のみ読み込む
- [ ] FR-026-02: Leaflet CSS のインポートを1箇所に集約する（グローバルCSS または MapView のみ）
- [ ] FR-026-03: MiniMap、ReviewCardMiniMap から重複した Leaflet CSS import を削除する
- [ ] FR-026-04: `react-leaflet-cluster` をヒートマップ同様、動的importまたは条件付きロードに変更することを検討する

### 非機能要件
- [ ] NFR-026-01: 地図の初回表示速度が現状と同等以上であること（遅延読み込みによるちらつきを防ぐ）
- [ ] NFR-026-02: バンドルサイズが現状比で30KB以上削減されること

## 受入条件
- [ ] AC-01: `import 'leaflet.heat'` がトップレベルに存在しない（grep で確認）
- [ ] AC-02: `leaflet/dist/leaflet.css` のインポートが1箇所のみ
- [ ] AC-03: ヒートマップ表示が正常に動作する（動的import後も機能する）
- [ ] AC-04: `npm run build` の出力で地図関連チャンクのサイズが削減されている

## 影響範囲
- `src/components/features/map/MapView.tsx`
- `src/components/features/map/MiniMap.tsx`
- `src/components/features/admin/ReviewCardMiniMap.tsx`
- `src/app/globals.css`（CSS集約先候補）

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: バンドルサイズ削減はモバイルユーザーの体験改善に直結するが、地図はSSR無効化済みで影響は限定的
