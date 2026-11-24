# REQ-111: Leaflet マーカー画像のセルフホスト化

> 親 REQ: REQ-092
> 関連 REQ: REQ-026（map-bundle-optimization）

## 背景
`src/components/features/posts/LocationPicker.tsx:7-9` で Leaflet のマーカー画像を `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png` から **直接読み込み**している。これは：

1. **SPOF**：unpkg.com 不通時に LocationPicker のマーカーが落ちる（投稿フォームで地点選択不能）
2. **CSP 緩和の温床**：`img-src https:` で広く許可せざるを得ない
3. **キャッシュ非効率**：Vercel Edge Cache / 自社 CDN が使えない

## 現状の問題
```ts
// src/components/features/posts/LocationPicker.tsx:7-9
iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
```

## 目的
Leaflet マーカー画像を `public/images/leaflet/` に同梱し、外部依存を排除して信頼性とキャッシュ効率を上げる。

## 要件

### 機能要件
- [ ] FR-111-01: `node_modules/leaflet/dist/images/` から以下 3 ファイルを `public/images/leaflet/` にコピー：
  - `marker-icon.png`
  - `marker-icon-2x.png`
  - `marker-shadow.png`
- [ ] FR-111-02: `src/components/features/posts/LocationPicker.tsx` の URL を `/images/leaflet/marker-icon.png` 等の相対パスに変更
- [ ] FR-111-03: 他に Leaflet マーカー画像を直参照している箇所が無いか grep で確認し、あれば同様に修正
- [ ] FR-111-04: `next.config.ts` の `headers()` で `/images/:path*` に既に `public, max-age=31536000, immutable` が設定済みなので、自動でキャッシュ最適化される

### 非機能要件
- [ ] NFR-111-01: マーカー画像の表示挙動が現状と完全に同一（位置・解像度・shadow）
- [ ] NFR-111-02: 投稿フォームの位置選択が回帰しない
- [ ] NFR-111-03: CSP の `img-src` を縮める将来の REQ で、`https:` を `'self'` に絞れる準備が整う

## 受入条件
- [ ] AC-01: `public/images/leaflet/{marker-icon,marker-icon-2x,marker-shadow}.png` が存在
- [ ] AC-02: `grep -rn "unpkg.com" src/` の結果が 0 件
- [ ] AC-03: `LocationPicker` で地図クリックすると `/images/leaflet/marker-icon.png` が読まれる（DevTools Network 確認）
- [ ] AC-04: `npm run build` 成功 + 既存テスト pass
- [ ] AC-05: 投稿フォームの位置選択が動作する（手動 or E2E）

## 影響範囲
- `public/images/leaflet/`（新規 3 ファイル）
- `src/components/features/posts/LocationPicker.tsx`
- `next.config.ts`（無変更、確認のみ）
- 将来：CSP の `img-src` 引き締め（別 REQ）

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 信頼性向上 + 将来の CSP 引き締めへの布石。XS 規模（30 分）。

## 実装メモ
- ファイルコピーコマンド：
  ```bash
  mkdir -p public/images/leaflet
  cp node_modules/leaflet/dist/images/marker-icon.png public/images/leaflet/
  cp node_modules/leaflet/dist/images/marker-icon-2x.png public/images/leaflet/
  cp node_modules/leaflet/dist/images/marker-shadow.png public/images/leaflet/
  ```
- ビルドプロセスで自動コピーする方が良い場合は `scripts/copy-leaflet-assets.ts` を `prebuild` フックで実行
  ただし依存関係的に `node_modules/leaflet` のバージョン更新時のリスクを考えると、コピーよりも src commit が運用しやすい
- `LocationPicker.tsx` 修正例：
  ```ts
  L.Icon.Default.mergeOptions({
    iconUrl: '/images/leaflet/marker-icon.png',
    iconRetinaUrl: '/images/leaflet/marker-icon-2x.png',
    shadowUrl: '/images/leaflet/marker-shadow.png',
  })
  ```
