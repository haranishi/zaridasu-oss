### 問題A: 地図のパン/ズームごとに可視マーカー全件が cluster から remove→add される — High

`src/components/features/map/MapView.tsx:450-460`（`visiblePosts` の `useMemo`）・`:471-474`（`handleBoundsChange`）・`:501`・`:562`（`position={position}`）。

**node_modules の実装まで追って裏取りした 5 段の連鎖**（推測ではなく実コードの確認結果）。

1. `MapView.tsx:472` の `setViewportBounds(bounds)` に渡る `bounds` は `map.getBounds()` の戻り値で、`leaflet-src.js:3951-3957` が**毎回 `new LatLngBounds` を返す**。したがって値が同一でも**参照は必ず変わる**。
2. `MapView.tsx:450-460` の `visiblePosts` の deps が `[posts, viewportBounds]` なので、**毎パンで再計算**され、`position: [post.lat, post.lng] as L.LatLngTuple` が投稿ごとに**新規配列**になる。
3. `react-leaflet/lib/Marker.js` の `updateMarker` は `props.position !== prevProps.position` の**参照比較**なので、2 の結果により**必ず true**（＝ `setLatLng` が呼ばれる）。
4. `leaflet-src.js:7834-7842` の `setLatLng` は**値の同一性を検査せず** `move` イベントを無条件に fire する。
5. `leaflet.markercluster-src.js:86` が `'move': this._childMarkerMoved` を購読しており、`:716-733` の `_moveChild` が **`removeLayer` ＋ `addLayer`（distance grid の再構築）**を実行する。

`MapView.tsx:446-449` のコメントは REQ-191 FR-191-06 として「レンダー毎に `<Marker position={[...]}>` へ新規配列リテラルを渡すと可視マーカー全件の更新が走り得るため、派生データ側で安定化する」と明示している。しかし **`viewportBounds` が同じ `useMemo` の deps に入っているため、パン/ズーム時にはこの安定化が一切効かない**（親再レンダーや凡例トグル時だけ有効）。意図と実効が乖離している。

**規模の裏取り**: 表示範囲フィルタ ON のとき `usePostList.ts:132` が `range(0, QUERY_LIMITS.posts - 1)` ＝ **最大 2000 件**（`constants.ts:539` の `QUERY_LIMITS.posts = 2000`）を取得し、`viewportBounds.pad(0.3)` 内が描画対象になる。広域ズームでは**最大 2000 マーカー分の `setLatLng` ＋ cluster remove ＋ add が 1 パンごとに走る**。フィルタ OFF（既定）では 50 件に留まる（REQ-308 問題B）ため実害は限定的だが、**フィルタを ON にした瞬間に顕在化する**。

`visibleSurveyRequests`（`:464-469`）も同じ deps 構造（`[surveyRequests, viewportBounds]`）で同じ問題を持つ。ただしこちらは cluster 外に描画され件数も小さいため優先度は下がる。
