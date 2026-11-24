### 問題B: 地図パン 1 回ごとに Header ＋ DrawerMenu 全ツリー ＋ FilterBar ＋ BottomNav が再レンダー — Medium

`src/views/HomePage.tsx:85-86`（`SET_MAP_BOUNDS`）・`:225-231`（`handleBoundsChange`）・`:245-265`・`:300-303`（インライン矢印 props）／`DrawerMenu.tsx:50-313`／`Header.tsx:49, :110`／`BottomNav.tsx:40`／`src/components/features/dashboard/FilterBar.tsx:26`。

**(1) 既定状態では state 更新そのものが無駄**

`HomePage.tsx:225-231` の `handleBoundsChange` は `boundsFilterEnabled` の有無に**かかわらず**、毎 `moveend` / `zoomend` で `dispatch({ type: 'SET_MAP_BOUNDS', bounds })` を実行する。一方 `mapBounds` が実際に使われるのは `boundsFilterEnabled === true` のときだけである。

- `:114-117`: `options` の正規化（`mapBounds: boundsFilterEnabled ? mapBounds : null`）— REQ-191 FR-191-04 の意図どおり、OFF 時は `usePostList` への入力が変化しないので**再フェッチは起きない**（ここは正しい）。
- `:201-207`: `displayedPosts` の絞り込み（`if (!boundsFilterEnabled || !mapBounds) return posts`）。

つまり **既定状態（フィルタ OFF）では、この state 更新は HomePage の再レンダーを引き起こすだけで、結果に一切影響しない完全な無駄**である。

**(2) 伝播先が memo で守られていない**

| コンポーネント | memo | 渡されている props |
|---|---|---|
| `Header`（`Header.tsx:49`） | **なし** | `onPostClick={() => handlePostClick('header')}` 等の**インライン矢印**（`HomePage.tsx:245-265`） |
| `FilterBar`（`FilterBar.tsx:26`） | **なし** | インライン（`onChange` は `:236-241` で `useCallback` 済み） |
| `BottomNav`（`BottomNav.tsx:40`） | **なし** | **インライン矢印 ×2**（`HomePage.tsx:300-303`） |
| `MapGalleryPager`（`HomePage.tsx:354`） | **あり** | `useCallback` 済み |
| `MapView`（`MapView.tsx:679`） | **あり** | — |

**(3) DrawerMenu が閉じていてもフルツリーを構築している**

`DrawerMenu.tsx:50-313` は **313 行のフルツリーに `if (!open) return null` が無く**、`:54-55`（オーバーレイの `opacity-0 pointer-events-none`）と `:63-64`（本体の `transition-transform` ＋ `-translate-x-full`）による **CSS での隠蔽のみ**で閉状態を表現している。したがって閉じている間も lucide アイコン 13 個・`MAP_LAYERS` のレイヤー一覧・ヒートマップトグル・言語切替（`LANGS`）・`UnlockTeaser` を**毎レンダーで React が再構築**し、**全ページで DOM ノード数が常時上乗せ**される。

`Header` は `Header.tsx:110` で `<DrawerMenu>` を**常時描画**するため、これは HomePage に限らずアプリ全体に効く。

なお REQ-278 FR-278-01 で `useProgress(open ? user?.id : undefined)`（`DrawerMenu.tsx:44`）となり **RPC の毎遷移発火は解消済み**である。残っているのは**描画コスト側**。

**(4) MapView 内部の `handleBoundsChange` が毎レンダー新規関数**

`MapView.tsx:471-474` の `handleBoundsChange` は `useCallback` されていない。これは `:590` で `<BoundsWatcher onBoundsChange={handleBoundsChange} />` に渡り、`BoundsWatcher`（`:185-197`）の `useMapEvents({ moveend, zoomend })` が**毎レンダーで off/on の再バインド**を行う。`HomePage.tsx:225-231` 側の `handleBoundsChange` は REQ-191 FR-191-02 で既に `useCallback` 済みであり、**MapView 内部の同名関数だけが取り残されている**。
