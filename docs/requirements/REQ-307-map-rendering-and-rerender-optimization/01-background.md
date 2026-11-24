## 背景

地図側の最適化は REQ-191 で相当に進んでいる（`memo(MapView)`＝`MapView.tsx:679`、`memo(MapGalleryPager)`＝`HomePage.tsx:354`、ビューポートカリング `pad(0.3)`、アイコン LRU キャッシュ、Popup children は開くまで DOM 化されない）。しかし**パン/ズーム操作の経路にだけ 2 つの穴が残っている**。

| 事象 | 発生タイミング | 規模 |
|---|---|---|
| 可視マーカー全件が cluster から remove→add される | パン/ズームごと（表示範囲フィルタ ON） | 最大 **2000 マーカー** ×（`setLatLng` ＋ cluster `removeLayer` ＋ `addLayer`）＝ **3 操作 × 2000 件を 1 パンごと** |
| 地図の外側（Header ＋ DrawerMenu 全ツリー ＋ FilterBar ＋ BottomNav）が再レンダー | パン/ズームごと（**フィルタ OFF の既定状態でも**） | DrawerMenu は 313 行のフルツリー（lucide アイコン 13 個・MAP_LAYERS 一覧・ヒートマップトグル・言語切替・UnlockTeaser） |

**守られているのは地図の内側だけで、守られていないのは地図の外側**という逆転が起きている。

---
