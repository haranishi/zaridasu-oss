# REQ-046: leaflet.heat の型定義を追加して `as any` を排除

## 背景
`leaflet.heat` は Leaflet 本体の `L` 名前空間を実行時に拡張するプラグインで、`@types/leaflet` には型が含まれない。本プロジェクトではこの回避のため `as any` を使って `heatLayer` を呼び出しているが、型安全性が損なわれ、オプションの typo やシグネチャ変更に気付けない。

## 現状の問題
- `src/components/features/map/MapView.tsx:112` で以下のように `as any` を使用：
  ```tsx
  heatRef.current = (L as any).heatLayer(points, HEATMAP_CONFIG).addTo(map)
  ```
- 同ファイル `:103-104` では動的 import に `@ts-expect-error` を付けて回避：
  ```tsx
  // @ts-expect-error -- side-effect-only module; dynamic import augments L at runtime
  await import('leaflet.heat')
  ```
- `src/types/` ディレクトリは ESLint 対象外（`eslint.config.js` の `ignores` 参照）のため、ここに型宣言を追加してもプロジェクトの lint 設定に干渉しない。

## 目的
`leaflet.heat` に対する最小限のアンビエント型定義を追加し、`as any` / `@ts-expect-error` による型穴を解消する。

## 要件
### 機能要件
- [ ] FR-046-01: `src/types/leaflet-heat.d.ts` を新規作成し、以下の宣言を含める：
  - `leaflet` モジュールを module augmentation で拡張し、`L.heatLayer(points, options)` が `Layer` を返す関数であることを宣言。
  - `HeatLatLngTuple`（例: `[number, number, number?]`）と `HeatMapOptions`（`radius`, `blur`, `maxZoom`, `max`, `minOpacity`, `gradient` など）の型を定義。
  - `leaflet.heat` モジュール自体を `declare module 'leaflet.heat'` として副作用 import 可能に宣言。
- [ ] FR-046-02: `src/components/features/map/MapView.tsx:112` の `(L as any).heatLayer(...)` を `L.heatLayer(...)` に置き換える。
- [ ] FR-046-03: `src/components/features/map/MapView.tsx:103` の `@ts-expect-error` を削除する（不要になるため）。

### 非機能要件
- [ ] NFR-046-01: ランタイム挙動（ヒートマップ表示、パラメータ `HEATMAP_CONFIG` の適用）は変わらない。

## 受入条件
- [ ] AC-01: `npm run type-check` が緑（エラー 0）。
- [ ] AC-02: `grep -n "as any" src/components/features/map/MapView.tsx` の結果が 0 件。
- [ ] AC-03: `grep -n "@ts-expect-error" src/components/features/map/MapView.tsx` が leaflet.heat 関連では 0 件。
- [ ] AC-04: 地図ページでヒートマップ表示が従来どおり描画される（手動確認）。

## 影響範囲
- 新規: `src/types/leaflet-heat.d.ts`
- 変更: `src/components/features/map/MapView.tsx`
- `tsconfig.json` の `include` に `src/types` が含まれていることを確認（含まれていなければ追記）。

## 優先度
- **緊急度**: Low
- **重要度**: Low
- **理由**: 型安全性の改善であり、ユーザー影響はない。ただし `as any` 排除はコード品質指針として推奨される。
