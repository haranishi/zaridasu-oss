## Phase C: テスト修正

### スキル構成図

```
Phase C: テスト修正
├── C-1: react-router-dom 依存の除去
│   ├── views/__tests__/HomePage.test.jsx     → MemoryRouter 除去
│   ├── views/__tests__/TrendsPage.test.jsx   → MemoryRouter 除去
│   ├── components/features/posts/__tests__/PostCard.test.jsx
│   ├── components/modals/__tests__/AuthModal.test.jsx
│   └── components/modals/__tests__/EditDialog.test.jsx
│
├── C-2: テストインフラ更新
│   ├── vitest.config.ts 作成 (vite.config.js から分離)
│   └── test/setup.js → setup.ts
│
└── C-3: ビルド・型チェック検証
    ├── next build 成功確認
    ├── tsc --noEmit 成功確認
    └── vitest run 成功確認
```

---

## Phase D: PWA 対応

### スキル構成図

```
Phase D: PWA 対応
├── D-1: next-pwa 導入
│   ├── npm install next-pwa
│   ├── next.config.ts に PWA プラグイン追加
│   └── public/ にアイコン配置確認
│
├── D-2: Service Worker キャッシュ戦略
│   ├── OSM/GSI タイル: StaleWhileRevalidate (3日 TTL)
│   ├── Supabase API: NetworkFirst (5分 TTL)
│   ├── 静的アセット: CacheFirst
│   └── ページ HTML: NetworkFirst
│
├── D-3: オフライン機能維持
│   ├── IndexedDB オフラインキュー (既存 offlineStore.ts)
│   ├── オフラインページ (/offline)
│   └── PendingPostsSection 連携
│
└── D-4: manifest.ts 検証
    ├── PWA インストール動作確認
    └── Lighthouse PWA スコア確認
```

---
