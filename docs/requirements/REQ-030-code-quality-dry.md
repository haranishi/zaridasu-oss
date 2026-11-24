# REQ-030: コード品質改善（DRY原則・型安全性）

## 背景
コードベース全体で、型定義の重複、ハードコードされた値、`as any` 型アサーションなどDRY原則・型安全性に反するパターンが散見される。保守コストの増大やリグレッションリスクの原因となっている。

## 現状の問題
- **型定義の重複**:
  - `src/components/modals/MapModal.tsx:6`: `MapPost` インターフェース定義
  - `src/components/features/map/MapView.tsx:203`: 同一の `MapPost` インターフェースがローカルに再定義
- **ハードコード値**:
  - `src/components/features/map/MapView.tsx:171`: 秋田県境界座標 `lat > 38.8 && lat < 40.7 && lng > 139.5 && lng < 141.8` がハードコード（`constants.ts` に `AKITA_BOUNDS` が存在するのに未使用）
  - `https://zaridasu.com` が `robots.ts`, `layout.tsx`, `sitemap.ts`, `area/[municipality]/page.tsx` の4箇所にハードコード（`process.env.NEXT_PUBLIC_APP_URL` を使うべき）
  - `src/components/features/posts/LocationPicker.tsx`: Leaflet マーカー画像URL `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png` 等がハードコード
- **型安全性の問題**:
  - `src/components/features/map/MapView.tsx:106`: `(L as any).heatLayer()` — leaflet.heat の型定義なし
- **デッドコード**:
  - `src/lib/imageUtils.ts:1-13`: `toThumbnailUrl()` が定義のみで未使用
  - `src/lib/rpcThrottle.ts:12-26`: `throttleRpc()` が定義のみで未使用

## 目的
コードの重複を排除し、型安全性を向上させ、デッドコードを除去することで保守性を改善する。

## 要件

### 機能要件
- [ ] FR-030-01: `MapPost` インターフェースを `src/types/index.ts` にエクスポートし、MapModal と MapView からインポートする
- [ ] FR-030-02: MapView の秋田県境界ハードコードを `AKITA_BOUNDS` 定数に置換する
- [ ] FR-030-03: `https://zaridasu.com` のハードコードを `process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'` に統一する（`siteUrl` 定数化）
- [ ] FR-030-04: Leaflet マーカー画像URLを定数化する
- [ ] FR-030-05: `leaflet.heat` の型定義ファイル（`src/types/leaflet.heat.d.ts`）を作成し、`as any` を除去する
- [ ] FR-030-06: 未使用の `toThumbnailUrl()` を REQ-022 で使用するまで保持、`throttleRpc()` は削除する

### 非機能要件
- [ ] NFR-030-01: `grep -r 'as any' src/` の結果がテストファイルを除いて0件になること

## 受入条件
- [ ] AC-01: `MapPost` の定義が `src/types/` に1箇所のみ存在する
- [ ] AC-02: `grep -rn 'zaridasu.com' src/` の結果が環境変数参照のフォールバック値のみ
- [ ] AC-03: `grep -rn '38.8' src/components/` がヒットしない（AKITA_BOUNDS 使用に置換済み）
- [ ] AC-04: `src/lib/rpcThrottle.ts` が削除されている
- [ ] AC-05: `npm run type-check` がエラーなしで完了する

## 影響範囲
- `src/types/index.ts`
- `src/types/leaflet.heat.d.ts`（新規）
- `src/components/features/map/MapView.tsx`
- `src/components/modals/MapModal.tsx`
- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/area/[municipality]/page.tsx`
- `src/components/features/posts/LocationPicker.tsx`
- `src/lib/rpcThrottle.ts`（削除）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 技術的負債の蓄積防止。個々の修正は小さいが、全体として保守性に大きく影響する
