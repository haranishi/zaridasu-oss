## 🟡 パフォーマンス

---

### REQ-009: mapBounds 変更時の再計算最適化

**背景**
`HomePage.jsx` の `displayedPosts` useMemo は `[posts, mapBounds, boundsFilterEnabled]` に依存している。マップをパンするたびに `mapBounds` が更新され、重い `displayedPosts` 計算が毎回トリガーされる。

#### ユーザーストーリー

```
As a ユーザー,
I want to マップをパン・ズームしてもアプリが快適に動作してほしい,
So that 地図操作中に遅延やカクつきを感じない。

受け入れ条件:
- [ ] マップパン中の displayedPosts 再計算が throttle/debounce で間引かれる
- [ ] ズームレベルが変わらないパン操作ではマーカーの再計算を最小化する
- [ ] mapBounds の更新頻度が適切に制限される（例: 200ms デバウンス）
- [ ] ビューポート内の判定計算が最適化される
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `mapBounds` の更新を `useDeferredValue` または 200ms デバウンスで間引く | 高 |
| F2 | bounds フィルタが無効な場合は `displayedPosts = posts`（計算スキップ） | 高 |
| F3 | ビューポート判定に空間インデックス（例: `rbush`）を検討する（posts 数が多い場合） | 低 |

#### 実装指針

```javascript
// MapView からの onBoundsChange を debounce
const debouncedSetMapBounds = useMemo(
  () => debounce((bounds) => setMapBounds(bounds), 200),
  []
)

// displayedPosts の条件分岐
const displayedPosts = useMemo(() => {
  if (!boundsFilterEnabled || !mapBounds) return posts
  return posts.filter(p => /* bounds チェック */)
}, [posts, mapBounds, boundsFilterEnabled])
```

---
