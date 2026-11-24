## 機能要件

- **FR-307-01**: `MapView.tsx:450-460` の `visiblePosts` を **2 段 `useMemo` に分割**する。
  - 第 1 段: `posts` **のみ**に依存する `Map<postId, L.LatLngTuple>`（または `{ post, position }` の配列）を構築する。`posts` が不変ならタプルの参照が維持される。
  - 第 2 段: `viewportBounds`（`pad(0.3)`）を**フィルタ判定にだけ**使い、第 1 段のオブジェクト／タプルを**参照ごと再利用**して絞り込む。
  - これにより問題Aの連鎖 2 が切れ、3（参照比較）が false になり、4・5（`setLatLng` → `move` → cluster remove+add）が発生しなくなる。
  - REQ-243 の座標欠損除外（`Number.isFinite` で hidden 投稿の NULL 座標を落とす）は第 1 段に置き、挙動を維持する。
- **FR-307-02**: `visibleSurveyRequests`（`:464-469`）にも FR-307-01 と同じ 2 段構造を適用する（REQ-191 FR-191-05 のカリングは維持）。
- **FR-307-03**: 上記でも更新頻度が問題になる場合の追加策として、`viewportBounds` を**タイル座標等に量子化**して state 更新の頻度そのものを落とす（例: `moveend` ごとに毎回 state を差し替えるのではなく、量子化後の値が変わったときだけ更新する）。**FR-307-01 で足りるなら任意**とし、実装判断を実測に委ねる。
- **FR-307-04**: `MapView.tsx:471-474` の `handleBoundsChange` を `useCallback` 化し、`BoundsWatcher` の `useMapEvents` の毎レンダー再バインドをなくす（`onBoundsChange` prop は HomePage 側で既に安定参照）。あわせて `BoundsWatcher` を `memo` 化するかを検討する。
- **FR-307-05**: `boundsFilterEnabled === false` のときは `mapBounds` を **reducer の state ではなく `useRef` に退避**し、`dispatch({ type: 'SET_MAP_BOUNDS' })` を発火しないようにする。フィルタ ON へトグルした瞬間に `map.getBounds()`（または ref の値）を 1 回読んで state へ反映する。`HomePage.tsx:114-117` の `options` 正規化（REQ-191 FR-191-04）とは重複せず補完関係にある（あちらは**再フェッチ**を防ぎ、こちらは**再レンダー**を防ぐ）。REQ-232 FR-232-04 の `map_interact` デバウンス計測（`:227-231`）は**フィルタ OFF でも従来どおり発火させる**こと。
- **FR-307-06**: `Header` / `FilterBar` / `BottomNav` を `memo` 化し、渡しているインライン矢印 props を `useCallback` へ移す（`HomePage.tsx:245-265`・`:300-303`）。`HomePage.tsx:236-241` の `handleFiltersChange` / `handleBoundsFilterOff` が既に同じ流儀で実装済みなので、**それに揃える**（新しい書き方を持ち込まない）。`handlePostClick(entry)` は引数付きなので、entry 別に `useCallback` した関数を用意するか `useMemo` でハンドラ束を作る。
- **FR-307-07**: `DrawerMenu` に **`open` ガード**を入れ、閉状態では配下ツリーを構築しない。
  - **実装上の注意**: 単純に `if (!open) return null` とすると `:63` の `transition-transform duration-300 ease-out` によるスライドアウトアニメーションが失われる（開いた瞬間に即表示、閉じた瞬間に即消滅する）。**閉アニメーションの完了（300ms）後にアンマウントする遅延解除**（`transitionend` 監視、または `open` の false 遷移から 300ms のタイマー、あるいは内部 `mounted` state）が必要。`prefers-reduced-motion` でアニメーションが無効な環境では即時アンマウントでよい。
  - `useEscapeKey(handleClose)`（`:48-49`）と `useProgress(open ? user?.id : undefined)`（`:44`＝REQ-278 FR-278-01）の挙動を壊さないこと。特に **`progress` が閉じても保持される**という現仕様（開閉のたびに再フェッチしない）は、アンマウントすると失われる。フック呼び出しをアンマウントされない外殻に残し、**内側の描画ツリーだけを遅延アンマウントする**構成にする。
  - **REQ-302（アクセシビリティ）でも DrawerMenu の閉状態 DOM 残存（閉じたドロワー内のフォーカス可能要素がタブ順・スクリーンリーダーに残る問題）を扱うため、実装は本 FR-307-07 に一本化し、二重に対応しないこと。**
