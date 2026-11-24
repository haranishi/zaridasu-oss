## 現状サマリー

| 区分 | 状態 | 詳細 |
|------|------|------|
| App Router ルーティング | 完了 | 全23ルート構築済み |
| SSR/SSG/ISR レンダリング | 完了 | 各ページに適切な戦略適用済み |
| SEO (メタデータ・JSON-LD・サイトマップ) | 完了 | generateMetadata + sitemap.ts |
| Supabase クライアント分離 | 完了 | server.ts / client.ts / middleware.ts |
| 認証ミドルウェア | 完了 | middleware.ts で保護ルート制御 |
| Leaflet 動的インポート | 完了 | MapViewWrapper + MiniMap |
| TypeScript 全面移行 | **未完了** | 85 JSX + 28 JS ファイル残存 |
| Vite 旧コード削除 | **未完了** | App.jsx, main.jsx, vite.config.js, index.html |
| ESLint Warning 解消 | **未完了** | 200+ 未使用 import |
| PWA (next-pwa) | **未完了** | Vite PWA → Next.js PWA 未移行 |
| テスト修正 | **未完了** | react-router-dom 依存 6ファイル |

---

## Phase A: クリーンアップ（旧コード削除・ESLint修正）

### 目的
Vite SPA の残骸を削除し、Next.js 専用のクリーンなコードベースにする。

### スキル構成図

```
Phase A: クリーンアップ
├── A-1: Vite 旧コード削除
│   ├── src/App.jsx           (react-router-dom ルーティング)
│   ├── src/main.jsx          (ReactDOM.createRoot エントリ)
│   ├── vite.config.js        (Vite + VitePWA 設定)
│   ├── index.html            (SPA エントリポイント)
│   ├── src/index.css          (旧グローバルCSS → globals.css に統合済)
│   └── src/components/ui/PageSEO.jsx  (react-helmet-async → generateMetadata)
│
├── A-2: 不要パッケージ削除
│   ├── react-router-dom      (→ App Router)
│   ├── react-helmet-async    (→ generateMetadata)
│   └── @vitejs/* 関連        (→ next build)
│
├── A-3: ESLint Warning 一括修正
│   ├── 未使用 import 削除 (200+ 箇所)
│   ├── 未使用変数削除
│   └── ESLint 設定を Next.js 対応に更新
│
└── A-4: package.json 整理
    ├── "type": "module" 追加
    └── 不要スクリプト削除
```

### 対象ファイル一覧

| ファイル | アクション | 理由 |
|----------|-----------|------|
| `src/App.jsx` | 削除 | react-router-dom ルーティング → App Router |
| `src/main.jsx` | 削除 | Vite エントリポイント → layout.tsx |
| `vite.config.js` | 削除 | Vite 設定 → next.config.ts |
| `index.html` | 削除 | SPA HTML → layout.tsx |
| `src/index.css` | 削除 | → globals.css に統合済み |
| `src/components/ui/PageSEO.jsx` | 削除 | react-helmet → generateMetadata |

---
