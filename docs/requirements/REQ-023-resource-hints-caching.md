# REQ-023: リソースヒント追加とキャッシュ戦略の最適化

## 背景
外部リソース（Supabase、OpenStreetMap タイルサーバー、天気API等）への事前接続ヒントがなく、初回アクセス時のDNS解決・TLSハンドシェイクに不要な待ち時間が発生している。また、ホームページに明示的なキャッシュ/ISR設定がない。

## 現状の問題
- `src/app/layout.tsx`: 外部ドメインへの `preconnect` / `dns-prefetch` リンクが未設定
- 主要外部リソース:
  - `*.supabase.co`（データベース・ストレージ）
  - `tile.openstreetmap.org`（地図タイル）
  - `cyberjapandata.gsi.go.jp`（国土地理院タイル）
  - `nominatim.openstreetmap.org`（逆ジオコーディング）
  - `api.open-meteo.com`（天気API）
- `src/app/(home)/page.tsx`: `revalidate` エクスポートがなく、キャッシュ動作がデフォルト任せ
- `src/app/request/[id]/page.tsx`: ISR/revalidate 未設定

## 目的
リソースヒントとキャッシュ設定により、初回表示速度（FCP/LCP）とTTFBを改善する。

## 要件

### 機能要件
- [ ] FR-023-01: `layout.tsx` の `<head>` に主要外部ドメインへの `<link rel="preconnect">` を追加する
- [ ] FR-023-02: 同ドメインへの `<link rel="dns-prefetch">` をフォールバックとして追加する
- [ ] FR-023-03: ホームページ（`src/app/(home)/page.tsx`）に `export const revalidate = 60`（60秒ISR）を設定する
- [ ] FR-023-04: 調査依頼ページ（`src/app/request/[id]/page.tsx`）に `revalidate = 300`（5分ISR）を設定する
- [ ] FR-023-05: 地域ページ（`src/app/area/[municipality]/page.tsx`）の revalidate を確認・最適化する

### 非機能要件
- [ ] NFR-023-01: preconnect は最大6ドメインに制限し、過剰なリソースヒントによるパフォーマンス低下を防ぐ
- [ ] NFR-023-02: ISR設定後、キャッシュ済みページが古いデータを表示する期間が許容範囲内であること

## 受入条件
- [ ] AC-01: ページソースに `<link rel="preconnect" href="https://edxmkqmjzbarjdgnkcvc.supabase.co">` 等が存在する
- [ ] AC-02: ホームページのレスポンスヘッダーに `s-maxage=60` が含まれる
- [ ] AC-03: DevTools > Network で外部リソースの接続時間が改善されている

## 影響範囲
- `src/app/layout.tsx`
- `src/app/(home)/page.tsx`
- `src/app/request/[id]/page.tsx`
- `src/app/area/[municipality]/page.tsx`

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 低実装コストで体感速度を大幅に改善できる。SEOにも好影響
