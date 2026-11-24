### 問題A: PhotoGallery が全件を仮想化なしで一括描画（最大 2000 投稿 × 3 枚） — Medium

`src/components/features/posts/PhotoGallery.tsx:76-109`。`items.map()` で全アイテムを一度に描画し、**windowing / 仮想スクロール / 段階描画がいずれも無い**。

1 アイテムあたりの構成: `<Link>` ＋ `<Image fill>` ＋ オーバーレイ `div` 4 つ（グラデーション帯／種別＋絵文字行／市町村行／日付行）＋ `format(new Date(post.created_at), 'M/d')` の date-fns 呼び出し。

**上限の裏取り**: `MAX_PHOTOS = 3`（`constants.ts:394`）、`QUERY_LIMITS.posts = 2000`（`constants.ts:539`）。表示範囲フィルタ ON で `usePostList.ts:132` が `range(0, 1999)` を実行するため、**理論上 2000 × 3 = 最大 6000 枚のカード**が一度に描画される。

`PhotoGallery.tsx:33-34` のコメント自体が「表示範囲フィルタ有効時 posts は最大 QUERY_LIMITS.posts(2000) 件になり得る」と認めており、`items` の `flatMap` は REQ-278 FR-278-05 で `useMemo` 済みである。しかし**メモ化されたのは派生配列の計算だけで、描画そのものは一切間引かれていない**。

`loading="lazy"`（`:94`）により**画像のネットワーク取得は抑制される**が、以下は全件分発生する。

- DOM ノード数（1 アイテム 7 ノード前後 × 最大 6000）
- レイアウト計算（`grid-cols-2` の `aspect-square` × 全件）
- `format(new Date(...))` の呼び出し（全件）

対応の候補は 2 つあり、**コスト対効果では CSS のみの手法が先**。

1. **`content-visibility: auto` ＋ `contain-intrinsic-size`** をカードに付ける。JS の追加ゼロ・ライブラリ追加ゼロで、画面外要素のレンダリング（レイアウト・ペイント）をブラウザ側でスキップさせられる。DOM ノード自体は残るが最も安価。
2. **初期 100 件 ＋ IntersectionObserver による段階追加**。DOM ノード数そのものを抑えられる。1 で不足する場合に採る。

`format` は `Intl.DateTimeFormat` インスタンスの再利用か文字列スライスへ置き換える（**表示は `M/d` のみなので date-fns は過剰**）。なお date-fns は REQ-209 FR-209-03 で named import ＋ロケール deep import に整理済みなのでバンドル上の問題はなく、**呼び出し回数（最大 6000 回）のコスト**が論点である。

### 問題B: HomePage が fetchMore を配線しておらず、既定状態の地図/ギャラリーが最新 50 件で打ち止め — Medium（機能欠落）

`src/views/HomePage.tsx:118`:

```ts
const { posts, loading, error: postsError, fetchPosts } = usePostList(filters, options)
```

`usePostList` は `{ posts, loading, hasMore, loadingMore, error, fetchPosts, fetchMore }` を返す（`usePostList.ts:188`）が、**HomePage は `fetchPosts` だけを取り出しており `fetchMore` / `hasMore` / `loadingMore` を配線していない**。

表示範囲フィルタ OFF（既定）では `usePostList.ts:132` が `range(0, PAGE_SIZE - 1)` = **50 件**（`constants.ts:76` の `PAGE_SIZE = 50`）しか取得せず、**追加読込を呼ぶ経路が存在しない**。結果として**ホームの地図マーカーと写真ギャラリーは常に最新 50 件のみ**になる。

これは性能問題ではなく**機能的欠落**として現れる（「データが少ない」「古い投稿が地図に出ない」）。市民参加型の観測マップという性質上、蓄積が増えるほど**見えないデータの割合が増える**。

無限スクロールの sentinel と `onLoadMore` を持つ唯一の実装は `src/components/features/posts/PostList.tsx:110-125`（`sentinelRef` ＋ `loadingMore` スピナー）だが、**この `PostList` はどこからも import されていない dead code** である（実 import は `src/views/__tests__/HomePage.test.tsx:61` の `vi.mock` のみ＝**テストがモックしているだけで本体は未使用**）。つまり「追加読込の実装は存在するが、繋がっていない」状態。

さらに構造上の問題として、**表示範囲フィルタを ON にした瞬間に 50 件 → 最大 2000 件へ跳ね上がる**（`usePostList.ts:132` の `boundsMode` 分岐）。この段差により、**問題A（PhotoGallery の 6000 枚描画）と REQ-307 問題A（2000 マーカーの cluster churn）が同時に顕在化する**。50 と 2000 の間に段階が無いこと自体を設計として直す必要がある。
