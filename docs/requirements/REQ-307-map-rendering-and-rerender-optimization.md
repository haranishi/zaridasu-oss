# REQ-307: 地図描画と再レンダーの最適化（マーカー churn・パン時の全ツリー再描画）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: 性能（描画）
状態: **提案 / 未実装**
関連: REQ-278（フロントエンド性能改善）, REQ-191（地図の再レンダー最適化 / FR-191-02 ハンドラ安定化・FR-191-03 memo・FR-191-04 bounds 正規化・FR-191-05 依頼マーカーのカリング・FR-191-06 position 事前計算）, REQ-202（マーカーのタブストップ除去）, REQ-232（map_interact 計測）, REQ-302（アクセシビリティ／DrawerMenu の閉状態 DOM）, REQ-308（一覧の件数上限＝本REQの負荷条件を決める）

## これは何か

地図のパン/ズーム操作の経路に残っている 2 つの性能問題（可視マーカー全件の cluster remove→add と、地図の外側コンポーネントの再レンダー）を潰すための要件定義。分量が多いため本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

地図の最適化は REQ-191 で相当に進んでおり、`memo(MapView)`・ビューポートカリング・アイコン LRU キャッシュなどは既に入っている。ところが**守られているのは地図の内側だけで、パン/ズームの経路と地図の外側（Header・DrawerMenu・FilterBar・BottomNav）は守られていない**という逆転が起きていた。本REQはその 2 箇所を、node_modules の実装まで追った根拠付きで特定し、修正内容と受入基準を定める。

## 主要な決定事項（要点）

- **問題A（High）の連鎖は実コードで裏取り済み**：`map.getBounds()` が毎回新しい `LatLngBounds` を返す → `visiblePosts` の `useMemo` が毎パン再計算されて `position` が新規配列になる → react-leaflet が参照比較で `setLatLng` を呼ぶ → Leaflet が値を検査せず `move` を fire → markercluster の `_moveChild` が `removeLayer` + `addLayer` を実行。表示範囲フィルタ ON では**最大 2000 マーカー × 3 操作が 1 パンごと**に走る。
- 対策は `visiblePosts` を **2 段 `useMemo` に分割**すること（第1段は `posts` のみに依存してタプル参照を安定させ、第2段は `viewportBounds` をフィルタ判定にだけ使う）。これで連鎖が 2 段目で切れる。`visibleSurveyRequests` にも同じ構造を適用する。
- **問題B（Medium）**：`handleBoundsChange` が `boundsFilterEnabled` に関係なく毎 `moveend`/`zoomend` で `SET_MAP_BOUNDS` を dispatch しており、**既定状態（フィルタOFF）では結果に一切影響しない完全な無駄**。フィルタ OFF 時は `useRef` に退避して dispatch しない。ただし REQ-232 の `map_interact` 計測は OFF でも従来どおり発火させる。
- 伝播先の `Header` / `FilterBar` / `BottomNav` は `memo` が無く、インライン矢印 props を受けている。`memo` 化と `useCallback` 移行を行い、**既存の `handleFiltersChange` の流儀に揃える**（新しい書き方を持ち込まない）。
- `DrawerMenu` は 313 行のフルツリーに `if (!open) return null` が無く、CSS の隠蔽のみで閉状態を表現している。`open` ガードを入れるが、**300ms のスライドアニメーションを壊さないよう遅延アンマウント**にし、`useProgress` の「閉じても progress を保持する」現仕様を守るためフック呼び出しは外殻に残す。
- **DrawerMenu の閉状態 DOM 残存は REQ-302（アクセシビリティ）でも扱うため、実装は FR-307-07 に一本化する**（二重対応しない）。
- 改善幅の数値は事前に約束せず、**before/after の実測を PR に添付する**方針（AC-06）。

## 部品

- [01-background.md](REQ-307-map-rendering-and-rerender-optimization/01-background.md) — 背景。REQ-191 で済んでいることと、残った 2 つの穴の事象・発生タイミング・規模の一覧。
- [02-problem-a-marker-churn.md](REQ-307-map-rendering-and-rerender-optimization/02-problem-a-marker-churn.md) — 問題A: 可視マーカー全件の cluster remove→add。node_modules まで追った 5 段の連鎖と規模の裏取り。
- [03-problem-b-outer-tree-rerender.md](REQ-307-map-rendering-and-rerender-optimization/03-problem-b-outer-tree-rerender.md) — 問題B: 地図の外側の再レンダー。無駄な state 更新／memo 未適用の一覧／DrawerMenu のフルツリー／`handleBoundsChange` の毎レンダー再生成。
- [04-functional-requirements.md](REQ-307-map-rendering-and-rerender-optimization/04-functional-requirements.md) — FR-307-01 〜 FR-307-07（2段 memo・量子化・useCallback・useRef 退避・memo 化・open ガード）。
- [05-acceptance-criteria.md](REQ-307-map-rendering-and-rerender-optimization/05-acceptance-criteria.md) — AC-01 〜 AC-08（Profiler での確認手順、機能退行11項目、`npm run size`、652テスト）。
- [06-out-of-scope.md](REQ-307-map-rendering-and-rerender-optimization/06-out-of-scope.md) — 対象外（MapView のファイル分離、件数上限設計＝REQ-308、Canvas/WebGL 移行）。
