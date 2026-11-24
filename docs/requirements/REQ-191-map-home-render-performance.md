# REQ-191: ホーム地図のレンダー/フェッチ性能（検索1打鍵ごとの全再レンダー・bounds 無関係の再フェッチ・依頼マーカー非カリング・Context 非メモ化）

## 背景
ザリダスのホーム画面（`src/app/(home)/HomeInteractive.tsx`）は、Leaflet 地図（`MapView`）と投稿マーカー・調査依頼マーカー・写真ギャラリーを横スワイプページャー（ローカル `MapGalleryPager`）で表示する。投稿データは `usePostList`、調査依頼は `useSurveyRequests` が供給する。

地図は表示要素が多くレンダーコストが高いため、`MapView.tsx` ではビューポート外マーカーのカリング（`visiblePosts`、`MapView.tsx:260-265`）や `MarkerClusterGroup`（`:289`）でマーカー DOM を抑制している。フェッチ側は検索入力を 300ms デバウンス（`HomeInteractive.tsx:175-183`）している。しかし**描画側の再レンダー抑制**と**bounds 由来の再フェッチ制御**には漏れがある。

## 現状の問題
ホーム地図まわりで、入力・地図操作・認証イベントを起点に過剰な再レンダー／再フェッチが発生する。以下の4点。

### 課題1: 検索1打鍵ごとに `HomeInteractive` 全体が再レンダーし、Leaflet ツリーへ伝播する
- 検索入力は `FilterBar`（`src/components/features/dashboard/FilterBar.tsx:77-88`）の `onChange={(e) => handleChange('search', e.target.value)}` → `onChange({ ...filters, search })`（`:33`, `:80`）→ ホームの `setFilters`（`HomeInteractive.tsx:208` の `onChange={(f) => setFilters(f as PostFilter)}`）。1 打鍵ごとに `filters` state が更新され、`HomeInteractive` 全体が再レンダーする。
- フェッチは 300ms デバウンス済み（`HomeInteractive.tsx:177-183`）だが、**描画は無防備**。再レンダーの度に子へ渡すハンドラが毎回新規関数になる（例: `onBoundsChange={(bounds) => dispatch(...)}`、`HomeInteractive.tsx:218`／`onBoundsFilterOff`、`:220`）。
- `MapGalleryPager`（ローカル関数コンポーネント、`HomeInteractive.tsx:273-367`）と `MapView`（`MapViewWrapper` 経由の dynamic、`src/components/features/map/MapView.tsx`）はいずれも `React.memo` 未適用のため、新規 props で再レンダーが Leaflet ツリーまで伝播する。
- `MapView` 内の各 `<Marker position={[post.lat, post.lng]} ...>`（`MapView.tsx:297`）は、レンダー毎に**新しい配列リテラル**を `position` に渡すため、可視マーカー全件で更新（再設定）が走り得る。

### 課題2: bounds フィルタ OFF でも、地図パン/ズーム毎に投稿が再フェッチされる
- 地図操作は `BoundsWatcher`（`MapView.tsx:156-169`）の `moveend`/`zoomend`（`:163-166`）→ `onBoundsChange` → ホームの `dispatch({ type: 'SET_MAP_BOUNDS', bounds })`（`HomeInteractive.tsx:218`, reducer `:88-89`）。
- `mapBounds` 変化で `options = useMemo({ mapBounds, boundsFilterEnabled }, [mapBounds, boundsFilterEnabled])`（`HomeInteractive.tsx:114`）が再生成 → `usePostList` の `buildQuery`（`src/hooks/usePostList.ts:33-86`、deps に `options.mapBounds`）と `fetchPosts`（`:88-107`、deps に `options.mapBounds`）の参照が変わる → デバウンスエフェクト（`HomeInteractive.tsx:177-183`、deps に `fetchPosts`）が再実行されフェッチが走る。
- しかし `buildQuery` は `options.boundsFilterEnabled && options.mapBounds` のとき**だけ** bounds 条件を付ける（`usePostList.ts:77-83`）。`boundsFilterEnabled` が `false` のときは `mapBounds` を使わないにもかかわらず、`mapBounds` 変化で**完全に同一のクエリ**が再実行される（パン/ズームの度に無駄な往復）。

### 課題3: 調査依頼マーカー（最大200件）が常時・全件描画され、カリング/クラスタの対象外
- `useSurveyRequests`（`HomeInteractive.tsx:118`）は `limit(200)`（`src/hooks/useSurveyRequests.ts:89`）で最大 200 件取得する。
- これらは `MapView.tsx:341-364` で `surveyRequests.map((sr) => <Marker ...>)` として**裸の `<Marker>` を常時描画**する。投稿マーカーに適用されている `viewportBounds.pad(0.3)` のビューポートカリング（`MapView.tsx:260-265`）にも、`MarkerClusterGroup`（`:289`）にも含まれない。ズームアウト時や依頼が増えた場合に、画面外を含む全依頼マーカーの DOM が常に存在する。

### 課題4: `MapSettingsContext` の Provider value が非メモ化
- `src/context/MapSettingsContext.tsx:38` の `<MapSettingsContext.Provider value={{ showHeatmap, setShowHeatmap, activeLayerId, setActiveLayerId }}>` は、**毎レンダーで新しいオブジェクトリテラル**を value に渡す。他の Context（例: `AuthContext.tsx:63-65` は `useMemo` 済み）と異なり、ここだけメモ化が漏れている。`MapSettingsProvider` が再レンダーする度に `useMapSettings` 消費者（`MapView.tsx:253`）が不要に再レンダーし得る。

## 目的
ホーム地図のレンダー/フェッチを、ユーザー操作の意味（検索確定・bounds フィルタ ON 時のみ bounds 反映）に沿って最小化する。検索入力の再レンダー波及を断ち、bounds 無関係の再フェッチを止め、依頼マーカーにもカリングを適用し、Context value をメモ化することで、地図常用時の描画・往復コストを削減する。

## 要件
### 機能要件
- [ ] FR-191-01: 検索入力をローカル state 化する。`FilterBar`（または `HomeInteractive`）で検索文字列をローカルに保持して即時に入力へ反映しつつ、デバウンス後にのみ親の `filters.search`（`setFilters`）へコミットする。1 打鍵ごとに `HomeInteractive` 全体が再レンダーしない構造にする。
- [ ] FR-191-02: `HomeInteractive` が `MapGalleryPager`/`MapView` へ渡すハンドラ（`onBoundsChange`、`HomeInteractive.tsx:218`／`onBoundsFilterOff`、`:220`／`onChange` 等）を `useCallback` で安定化する。
- [ ] FR-191-03: `MapGalleryPager`（`HomeInteractive.tsx:273-367`）と `MapView`（`src/components/features/map/MapView.tsx` のデフォルトエクスポート）を `React.memo` でラップし、props 不変時の再レンダーを抑止する。props の identity 安定化（FR-191-02）と併せて効果を出す。
- [ ] FR-191-04: `usePostList` に渡す `options` の `mapBounds` を、bounds フィルタ有効時のみ実値・無効時は `null` にする（例: `mapBounds: boundsFilterEnabled ? mapBounds : null`、`HomeInteractive.tsx:114`）。これにより `boundsFilterEnabled === false` のパン/ズームでは `buildQuery`/`fetchPosts` の参照が変わらず、無駄な再フェッチが起きないようにする。`buildQuery` の bounds 適用条件（`usePostList.ts:77-83`）と整合させる。
- [ ] FR-191-05: 調査依頼マーカー（`MapView.tsx:341-364`）に、投稿マーカーと同等のビューポートカリングを適用する（`visiblePosts` と同様に `viewportBounds.pad(0.3)` で画面外の依頼を描画しない）。クラスタ要否は依頼件数特性に応じて判断するが、最低限カリングは適用する。
- [ ] FR-191-06: `MapView` の投稿マーカー `position`（`MapView.tsx:297`）等、レンダー毎に新規生成される配列リテラルが可視マーカー全件の更新を誘発しないよう、安定化（メモ化や派生データの事前計算）を行う。挙動（マーカー位置・ポップアップ）は変えない。
- [ ] FR-191-07: `MapSettingsContext` の Provider value（`src/context/MapSettingsContext.tsx:38`）を `useMemo` でメモ化し、依存（`showHeatmap`・`activeLayerId`・各 setter）が変化したときのみ value を再生成する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-191-01: 既存のフェッチデバウンス（300ms、`HomeInteractive.tsx:177-183`）・bounds フィルタ機能・クラスタリング・ヒートマップ表示・凡例等の挙動を退行させないこと。
- [ ] NFR-191-02: 地図のマーカー表示内容（投稿・依頼・不在確認アイコン、ポップアップ、詳細リンク）は現状と同一であること。

## 受入条件
- [ ] AC-01: 検索ボックスに 1 文字入力したとき、`MapView`（および `MapGalleryPager`）が再レンダーしない（React Profiler もしくは描画回数を計測するテストで確認）。入力自体は即時に反映され、フェッチはデバウンス後 1 回に収束する。
- [ ] AC-02: `boundsFilterEnabled === false` の状態で地図をパン/ズームしても、`posts` のフェッチ（`usePostList.fetchPosts` の発火 / Supabase へのクエリ）が**追加で発生しない**ことをテスト/モックで確認できる。`boundsFilterEnabled === true` のときは従来どおり bounds 反映でフェッチされる。
- [ ] AC-03: 画面外（現ビューポート + pad(0.3) の外）にある調査依頼マーカーが DOM/Leaflet レイヤーに描画されないことを確認できる（ズームアウト時のマーカー DOM 数が、可視領域内件数に概ね一致）。
- [ ] AC-04: `MapSettingsProvider` の再レンダー時に、`showHeatmap`/`activeLayerId` が不変なら `useMapSettings` 消費者（`MapView`）が再レンダーしないことを確認できる。
- [ ] AC-05: ヒートマップ切替・地図レイヤー切替・bounds フィルタ ON/OFF・マーカークリック→詳細遷移が現状どおり動作する（機能回帰なし）。
- [ ] AC-06: `next build`・型チェック・既存テスト（`src/hooks/__tests__/usePostList.test.ts` 等）が通過する。

## 影響範囲
- `src/app/(home)/HomeInteractive.tsx`（検索ローカル state 化・ハンドラ `useCallback`・`options.mapBounds` 条件化・`MapGalleryPager` の memo 化、`:114`, `:206-221`, `:273-367`）
- `src/components/features/dashboard/FilterBar.tsx`（検索のローカル state 化・デバウンスコミット、`:77-88`）
- `src/components/features/map/MapView.tsx`（`React.memo`・依頼マーカーのカリング・`position` 安定化、`:250`, `:260-265`, `:297`, `:341-364`）
- `src/hooks/usePostList.ts`（`options.mapBounds` 条件化に伴う回帰確認、`:77-86`, `:88-107`）
- `src/context/MapSettingsContext.tsx`（Provider value の `useMemo`、`:37-42`）
- `src/components/features/map/MapViewWrapper.tsx`（dynamic ラッパ。memo 適用箇所の確認）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 機能は動作するが、検索の 1 打鍵・地図パン/ズーム（bounds フィルタ OFF 時を含む）・依頼マーカー全件描画が、地図という高コストツリーに対する過剰な再レンダー/再フェッチを生む。地図を主用途とするアプリの体感性能・バッテリ・データ転送に継続的に影響する。各修正（ローカル state 化・`useCallback`/`React.memo`・条件付き bounds・カリング・Context メモ化）は確立された React/Leaflet 最適化手法で、副作用が小さく検証可能。
