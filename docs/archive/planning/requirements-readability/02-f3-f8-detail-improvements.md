### F3: テキスト省略の改善

**原則**: コンテンツテキスト（コメント等）は省略せず折り返す。スペースが限られる場合は `line-clamp` で最低 2〜3 行表示し、`title` 属性で全文をツールチップ表示。

| コンポーネント | 現状 | 変更後 |
|-------------|------|--------|
| **PostCard.jsx:114** | `text-xs truncate`（1行で切る） | `text-sm line-clamp-2`（2行表示 + title 属性） |
| **PostCard.jsx:64** | 種名 `truncate` | `truncate` 維持 + `title={speciesName}` |
| **MapView.jsx:242** | `line-clamp-2` | `line-clamp-3`（3行に拡大） |
| **Header.jsx:258** | メールアドレス `truncate` | `truncate` 維持 + `title={email}` |

### F4: 地図ポップアップの精読性改善

```
変更前:
┌────────────────┐
│ 🦞 アメリカザリガニ │  font-bold text-sm
│ 目撃 · 3/20      │  text-gray-500 text-xs ← 薄い+小さい
│ 由利本荘市        │  text-gray-400 text-xs ← 更に薄い
│ ウシガエルでは...  │  text-gray-600 text-xs line-clamp-2
│ 詳細 →           │  text-red-600 text-xs
└────────────────┘

変更後:
┌────────────────────┐
│ 🦞 アメリカザリガニ   │  font-bold text-sm（維持）
│ 👁️ 目撃 · 3/20      │  text-gray-600 text-sm ← 濃く+大きく
│ 📍 由利本荘市        │  text-gray-600 text-sm ← 濃く+大きく
│ ウシガエルではあり   │  text-gray-700 text-sm line-clamp-3
│ ませんがAI判定ど... │
│ 詳細を見る →       │  text-red-600 text-sm font-medium
└────────────────────┘
```

- ポップアップの `minWidth` を `140px` → `180px` に拡大
- コメントの `line-clamp` を 2 → 3 に
- テキストすべてを `text-sm` に統一

### F5: StatsBar の精読性改善

```
変更前（text-xs、薄いグレー、text-[10px]の前月比）:
 234件 | 今月 12件 ▲3 | ザリ 180 カエル 54

変更後（text-sm、濃いグレー、text-xs の前月比）:
 234件 | 今月 12件 ▲3 | ザリ 180 カエル 54
```

- `text-xs` → `text-sm`（バー全体）
- `text-[10px]` → `text-xs`（前月比）
- `text-gray-500` → `text-gray-600`（ラベル）
- ミニバーの高さ `h-1` → `h-1.5`

### F6: PostCard のレイアウト微調整

- 種アイコン: `w-8 h-8` → `w-9 h-9`（少し大きく）
- 写真サムネイル: `w-12 h-12` → `w-14 h-14`（少し大きく）
- 行間: コメント行に `leading-relaxed` を追加
- 上下パディング: `py-3` → `py-3.5`（行間を広げ密度を下げる）

### F7: チャートラベルの精読性

| チャート | 現状 | 変更後 |
|---------|------|--------|
| **BarChart.jsx** | 軸ラベル `fontSize: 10` | `fontSize: 12` |
| **BarChart.jsx** | ラベル色 `text-gray-400` | `text-gray-500` |
| **TrendsPage.jsx** | 種類内訳ラベル `text-xs` | `text-sm` |
| **TrendsPage.jsx** | プログレスバー `h-1` / `h-1.5` | `h-2` |
| **TrendsKPI.jsx** | モバイルラベル `text-[10px]` | `text-xs`（12px） |

### F8: フォームラベルの精読性

| コンポーネント | 現状 | 変更後 |
|-------------|------|--------|
| **FilterBar ドロワー** | ラベル `text-xs font-semibold` | `text-sm font-semibold` |
| **PostForm** | ラベル `text-xs` | `text-sm` |
| **EditDialog** | ラベル `text-xs` | `text-sm` |
| **AuthModal** | ラベル `text-xs` | `text-sm` |
| **AuthModal** | ベネフィットリスト `text-xs` | `text-sm` |

---
