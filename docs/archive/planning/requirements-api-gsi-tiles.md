> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-001 国土地理院タイル 地図レイヤー切り替え

- **ID**: API-001
- **優先度**: 🟢 最優先（即実装）
- **使用API**: 国土地理院 地図タイル API（無料・認証不要）
- **作成日**: 2026-03-15

---

## ユーザーストーリー

| 対象ユーザー | やりたいこと | 理由 |
|------------|------------|------|
| 一般投稿者 | 航空写真レイヤーに切り替えて現地の地形を確認しながらピンを置きたい | 田んぼ・川・住宅地を視覚的に確認できると場所の特定精度が上がる |
| 農業従事者・行政 | 農地分類（nrg）レイヤーと出没マーカーを重ね合わせて確認したい | 農業被害との地理的相関を視覚的に把握できる |
| モバイルユーザー | 淡色地図で背景をシンプルにしてマーカーだけ見やすくしたい | デフォルトの OSM は情報量が多く、マーカーが埋もれる |

---

## 機能要件

**F1: レイヤー定義**

以下5レイヤーを `src/lib/constants.js` に `MAP_LAYERS` 配列として定義する。

| id | 名称 | URL テンプレート | 用途 | maxZoom |
|----|------|-----------------|------|---------|
| `osm` | 標準地図 | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | デフォルト | 19 |
| `pale` | 淡色地図 | `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png` | マーカーを目立たせる | 18 |
| `std` | 詳細地図 | `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` | 道路・地名詳細 | 18 |
| `photo` | 航空写真 | `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg` | 現地確認 | 18 |
| `nrg` | 農地分類 | `https://cyberjapandata.gsi.go.jp/xyz/nrg/{z}/{x}/{y}.png` | 農業被害分析 | 17 |

**F2: レイヤー切り替えUI**

- `MapView.jsx` の地図左上（`leaflet-top leaflet-left`）にレイヤー切り替えボタングループを配置
- 各レイヤーのショートラベル（「標準」「淡色」「詳細」「写真」「農地」）をボタンテキストに使用
- アクティブレイヤーはハイライト表示
- ボタンタップでそのレイヤーの `TileLayer` に即時切り替え
- Leaflet の `attribution` を各レイヤーに合わせて動的変更

**F3: 設定の永続化**

- 選択したレイヤーIDを `localStorage` キー `zaridasu_map_layer` に保存
- 次回起動時に保存済みレイヤーを復元（保存値が無効な場合は `osm` にフォールバック）

**F4: PWA キャッシュ設定**

- `vite.config.js` の `workbox.runtimeCaching` に地理院タイルを追加
- ハンドラー: `StaleWhileRevalidate`
- キャッシュ名: `gsi-tiles`
- 上限: `maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 3`（3日間）

**F5: attribution 義務対応**

- 国土地理院タイル選択時は `Leaflet` の attribution に「国土地理院」を表示
- 利用規約（[地理院タイルについて](https://maps.gsi.go.jp/development/ichiran.html)）に基づく出所明示義務を履行する

---

## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | 完全無料（国土地理院タイルは無償公開） |
| セキュリティ | APIキー不要・認証不要 |
| アクセシビリティ | ボタンに `aria-label`、キーボード操作対応 |
| パフォーマンス | OSM タイルと同等（CDN配信）。航空写真は大きいため上限設定で管理 |
| オフライン | キャッシュ済みタイルはオフライン表示可能 |

---

## 実装設計

### 新規ファイル
- なし

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/constants.js` | `MAP_LAYERS` 配列を追加 |
| `src/components/features/map/MapView.jsx` | `useState` でアクティブレイヤー管理、レイヤー選択UIボタン追加、`TileLayer` URL 動的化 |
| `vite.config.js` | workbox runtimeCaching に `cyberjapandata.gsi.go.jp` 追加 |
| `src/locales/{ja,en,zh,ko}/translation.json` | `map.layers.*` キー追加 |

### Supabase 変更
- なし

---

## テスト観点

1. 各レイヤーボタン押下後にタイルURLが変わること（network タブで確認）
2. `localStorage` に選択レイヤーIDが保存され、ページリロード後に復元されること
3. 無効な `localStorage` 値（`invalid` など）がある場合に `osm` で表示されること
4. 国土地理院タイル選択時に attribution に「国土地理院」が表示されること
5. 全レイヤーで地図が秋田県を正しく表示できること
