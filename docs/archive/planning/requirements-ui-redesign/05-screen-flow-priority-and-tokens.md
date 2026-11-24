## 画面遷移図

```
ボトムタブ
├── 🗺️ 地図（HomePage）
│   ├── [地図 | リスト] セグメント切替
│   ├── ミニプロフィール（ログイン時）
│   ├── 検索アイコン → フィルターシート
│   └── 投稿カード → /post/:id（DetailPage）
├── 📊 統計（TrendsPage）
├── ＋ 投稿（PostForm モーダル）
│   ├── オンライン → 通常投稿
│   └── オフライン → 下書き保存
├── 🏆 ランキング（RankingPage）
└── 👤 マイページ（DashboardPage）
    ├── プロフィール編集モーダル
    ├── 未送信の下書き
    ├── 自分の投稿一覧
    └── 統計・CSV折りたたみ
```

---

## 実装優先度

| 優先度 | 改善項目 | 影響度 | 実装コスト | 対象ファイル |
|--------|----------|--------|------------|-------------|
| **高** | ボトムタブナビ追加 | 大 | 中 | 新規 `BottomNav.jsx`, `App.jsx`, `HomePage.jsx` |
| **高** | ヘッダー簡素化 | 大 | 小 | `Header.jsx`, `DrawerMenu.jsx` |
| **中** | ホーム画面ミニプロフ | 中 | 小 | `HomePage.jsx`, 新規 `MiniProfile.jsx` |
| **中** | PostCardカード型化 | 中 | 中 | `PostCard.jsx`, `PostList.jsx` |
| **中** | フィルタバー簡素化 | 中 | 小 | `FilterBar.jsx` |
| **中** | 地図/リスト セグメント切替 | 小 | 小 | `HomePage.jsx` |
| **低** | マイページ整理 | 小 | 中 | `DashboardPage.jsx` |

---

## 新規コンポーネント

| コンポーネント | パス | 概要 |
|-------------|------|------|
| `BottomNav` | `src/components/layout/BottomNav.jsx` | 5タブのボトムナビゲーション |
| `MiniProfile` | `src/components/features/home/MiniProfile.jsx` | ホーム画面のミニプロフィールカード |

## 削除・縮小対象

| 対象 | 変更内容 |
|------|----------|
| FAB（地図上の投稿ボタン） | ボトムタブに統合、削除 |
| DrawerMenu のナビ項目 | ボトムタブに移動、ドロワーは設定のみ |
| StatsBar | フィルタシート内に移動 or 簡素化 |
| Header の赤グラデーション | フラットな白/ダークに変更 |

---

## デザイントークン変更（参考）

```
ヘッダー高さ:    h-14 → h-12
ボトムタブ高さ:  新規 h-16 (64px) + safe-area
カード角丸:      rounded-2xl → rounded-xl（カードをコンパクトに）
投稿カード写真:  w-14 h-14 → w-full aspect-[4/3]（グリッド表示時）
```
