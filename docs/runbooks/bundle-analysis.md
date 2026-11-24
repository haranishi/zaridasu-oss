# バンドル分析（@next/bundle-analyzer）

## 何をするか
`@next/bundle-analyzer` で生成される treemap HTML から、Next.js が生成した各チャンクのモジュール内訳を可視化する。

## 実行
```bash
npm run analyze
```

完了後、以下が自動でブラウザで開く（または `.next/analyze/` 配下に出力）：
- `client.html` … ブラウザに送られる JS（**最重要**）
- `nodejs.html` / `edge.html` … SSR / Edge Runtime 用

## 解釈の指針

### First Load JS の特定
`next build` のターミナル末尾に出る Route 別 First Load JS テーブルと、`client.html` の Top チャンクを突き合わせる。

- `chunks/app/(home)/page-*.js` → `/` の First Load
- `chunks/app/admin/posts/page-*.js` → `/admin/posts` の First Load
- `chunks/4bd1b696-*.js` → Framework + React（触らない）

### 重い依存の発見手順
1. `client.html` を開く
2. ファイルサイズ降順で見て node_modules 配下を確認
3. **30KB 超** の単独依存があれば dynamic import 検討
4. `leaflet` / `react-leaflet-cluster` / `exifr` / `i18next` 等が初回 bundle に乗っていないか確認

### dynamic import が効いているかの確認
- 動的 import 化したコンポーネント（`PostForm`, `MapView` 等）が **別チャンク** として切り出されているか
- 切り出されたチャンク名は `chunks/<ハッシュ>.js` で、初回 First Load には含まれない

## CI には含めない
本番 CI では実行しない（ビルド時間 +30s 程度）。リグレッション検出は `size-limit`（REQ-062）に任せる。

## 関連
- REQ-098（本書を生んだ要件）
- REQ-062（size-limit / Lighthouse CI）
- REQ-092（軽量化包括要件）
