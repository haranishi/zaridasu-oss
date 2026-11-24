## 受入基準

- **AC-01**: React DevTools Profiler で、**表示範囲フィルタ ON・投稿 2000 件規模のデータでパン 1 回**を行ったとき、`Marker` の再マウントが 0 件で、cluster の `removeLayer` / `addLayer` が**可視マーカー件数分は発生しない**（`_moveChild` が呼ばれない）。確認は `leaflet.markercluster` の `_moveChild` にブレークポイント／カウンタを仕込むか、Performance パネルのスクリプト実行時間で行う。現状は最大 2000 件 × 3 操作が 1 パンごとに走る。
- **AC-02**: 既定状態（**表示範囲フィルタ OFF**）でパン/ズームを行ったとき、**`Header` / `DrawerMenu` / `FilterBar` / `BottomNav` のいずれも再レンダーされない**（Profiler の commit に現れない）。`SET_MAP_BOUNDS` の dispatch が発火していないこと。
- **AC-03**: `DrawerMenu` が閉じている状態で、配下の DOM ノード（lucide アイコン 13 個・`MAP_LAYERS` 一覧・ヒートマップトグル・言語切替・`UnlockTeaser`）が**DOM に存在しない**（DevTools の Elements で確認）。かつ**開閉のスライドアニメーション（300ms）が従来どおり機能する**（開くとき・閉じるときの両方）。
- **AC-04**: `MapView` の `BoundsWatcher` の `moveend` / `zoomend` リスナが、地図の再レンダーごとに off/on されない（`useMapEvents` の再バインドが起きない）。
- **AC-05**: 機能退行がない。具体的に、(a) 種別ごとのマーカーアイコンとアニメーション（REQ-265）、(b) クラスタリングの見た目と展開、(c) ビューポートカリング `pad(0.3)` によるちらつき防止、(d) 凡例の折りたたみ、(e) 現在地ボタン、(f) レイヤ切替とヒートマップ、(g) 調査依頼マーカー（REQ-191 FR-191-05）、(h) hidden 投稿を地図に出さない挙動（REQ-243）、(i) `keyboard={false}` によるタブストップ除去（REQ-202）、(j) 表示範囲フィルタのトグル ON/OFF と `displayedPosts` の絞り込み、(k) `map_interact` 計測（REQ-232 FR-232-04）のすべてが従来どおり動く。
- **AC-06**: 表示範囲フィルタ ON でのパン操作の体感が改善していることを実測で示す（Performance パネルの `moveend` 起点のスクリプト実行時間、またはロングタスク数の before/after を PR に記載）。**数値の改善幅は事前に約束しないが、before/after の計測結果を必ず添付する。**
- **AC-07**: `npm run size` がパスする。本REQは描画ロジックの変更のみでライブラリ追加を伴わないため、home の 9.32/10 kB 枠に収まること（`memo` / `useCallback` / 2 段 memo の追加でルート固有チャンクが 10 kB を超えないこと）。REQ-306 で追加された共有チャンク／ルート合算の予算もパスする。
- **AC-08**: `lint` / `type-check` / 既存 **652 テスト**がパスする。特に `src/views/__tests__/HomePage.test.tsx` と地図関連テストが、`memo` 化・`useRef` 退避・DrawerMenu の遅延アンマウントによって壊れていないこと（壊れる場合はテスト側を実装意図に合わせて更新する）。
