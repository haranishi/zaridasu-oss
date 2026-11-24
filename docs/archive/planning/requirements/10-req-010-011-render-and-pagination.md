### REQ-010: ヒートマップの再描画最適化

**背景**
`MapView.jsx` のヒートマップレイヤーは `posts` データが変わるたびに `L.heatLayer` を削除・再生成している。`posts` が多い場合（100件以上）にパン・ズームのたびに描画コストが発生する。

#### ユーザーストーリー

```
As a ユーザー,
I want to ヒートマップ表示中でもマップが快適に動作してほしい,
So that データ傾向の把握と地図操作を同時に行える。

受け入れ条件:
- [ ] ヒートマップの再描画は posts データが変化した時のみ行われる
- [ ] マップのパン・ズーム操作ではヒートマップの再計算が発生しない
- [ ] ヒートマップ ON/OFF 切り替えが即座（100ms 以内）に反映される
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `useEffect` の依存配列を `[posts, showHeatmap]` のみに限定する | 高 |
| F2 | `heatPoints` を `useMemo` でメモ化し、posts 変化時のみ再計算する | 高 |
| F3 | `heatLayer.setLatLngs()` を使用してレイヤー削除・再生成を避ける | 中 |

---

### REQ-011: 管理画面ページネーションの最適化

**背景**
管理画面（`AdminPostsPage.jsx` など）でページを切り替えるたびに全データを Supabase から再フェッチしている。サーバー側ページネーションが未実装。

#### ユーザーストーリー

```
As a 管理者,
I want to 管理画面でページを切り替えるときに素早く次のデータを見たい,
So that 大量の投稿を効率よく確認・管理できる。

受け入れ条件:
- [ ] ページネーションはサーバー側で処理される（`range()` を使用）
- [ ] ページ切り替えで取得するのは該当ページのデータのみ
- [ ] ローディング中は前ページのデータを維持する（ちらつき防止）
- [ ] 総件数が表示される（「全 N 件」）
- [ ] ページあたりの件数を変更できる（25件/50件/100件）
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `AdminPostsPage` の query に `.range(from, to)` を適用する | 高 |
| F2 | 総件数を `count: 'exact'` オプションで取得する | 高 |
| F3 | `keepPreviousData` パターンで UX 改善する | 中 |
| F4 | ページあたりの件数を選択する UI を追加する | 低 |

#### 実装指針

```javascript
const PAGE_SIZE = 50
const from = (currentPage - 1) * PAGE_SIZE
const to = from + PAGE_SIZE - 1

const { data, count } = await supabase
  .from('posts')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(from, to)
```

---
