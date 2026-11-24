# REQ-011: HomePage useEffect の不安定な依存関係

## 背景
`HomePage` から `usePostList` フックに渡される `options` オブジェクトが毎レンダリングで新しい参照を生成するため、`usePostList` 内部の `useCallback` 依存配列が不安定になり、不要な再フェッチやパフォーマンス劣化を引き起こす可能性がある。

## 現状の問題

### HomePage 側 (src/views/HomePage.tsx)
- **L108-111**: `usePostList` の第2引数に毎レンダリングで新規オブジェクトリテラルを渡している:
  ```tsx
  const { posts, loading, hasMore, loadingMore, fetchPosts, fetchMore } = usePostList(filters, {
    mapBounds,
    boundsFilterEnabled,
  })
  ```
  `{ mapBounds, boundsFilterEnabled }` は毎レンダリングで新しいオブジェクト参照となる。

- **L132-138**: デバウンス useEffect が `fetchPosts` と `filters` に依存:
  ```tsx
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchPosts()
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [fetchPosts, filters])
  ```
  `fetchPosts` の参照が不安定であれば、`filters` が変わっていなくてもデバウンスタイマーがリセットされ再フェッチが発生する。

### usePostList 側 (src/hooks/usePostList.ts)
- **L32-77**: `buildQuery` の `useCallback` 依存配列に `options.boundsFilterEnabled` と `options.mapBounds` を含む:
  ```tsx
  const buildQuery = useCallback(() => {
    // ...
  }, [filters, options.boundsFilterEnabled, options.mapBounds])
  ```
  `options` はオブジェクトなのでプロパティアクセスは参照的には安定しているが、`options` 自体が不安定な場合に React の将来のバージョンで問題になる可能性がある。

- **L79-98**: `fetchPosts` の `useCallback` が `buildQuery`, `options.boundsFilterEnabled`, `options.mapBounds` に依存:
  ```tsx
  const fetchPosts = useCallback(async () => {
    // ...
  }, [buildQuery, toast, options.boundsFilterEnabled, options.mapBounds])
  ```
  `mapBounds` は Leaflet の `LatLngBounds` オブジェクトであり、地図操作のたびに新しいインスタンスが生成される。値が同じでも参照が異なるため `buildQuery` → `fetchPosts` のカスケード再生成が発生する。

- **実際の影響**: `mapBounds` が変わるたびに `buildQuery` が再生成 → `fetchPosts` が再生成 → HomePage の `useEffect` (L132-138) が発火 → 300ms デバウンス後にフェッチ実行。地図のパン/ズーム中に連続的にフェッチがトリガーされる。`boundsFilterEnabled` が false の場合でも `mapBounds` の変更で再フェッチが走る非効率がある。

## 目的
`usePostList` の依存関係を安定化し、不要な再レンダリング・再フェッチを防止する。

## 要件

### 機能要件
- [ ] FR-011-01: `usePostList` の `options` パラメータを個別の引数（`mapBounds`, `boundsFilterEnabled`）にするか、`useMemo` で安定化した上で渡すよう変更する
- [ ] FR-011-02: `mapBounds` の比較を参照ではなく値ベース（`getSouth()`, `getNorth()`, `getWest()`, `getEast()` の数値比較）で行い、値が同一であれば `buildQuery` を再生成しないようにする
- [ ] FR-011-03: `boundsFilterEnabled` が `false` の場合は `mapBounds` の変更が `buildQuery` / `fetchPosts` の再生成を引き起こさないようガードする
- [ ] FR-011-04: `fetchPosts` を `useRef` で最新の関数を保持するパターンに変更するか、`useEffect` 内のデバウンスロジックを安定化する

### 非機能要件
- [ ] NFR-011-01: 地図パン/ズーム時の不要な API コール数を削減すること（`boundsFilterEnabled: false` 時はゼロ）
- [ ] NFR-011-02: React Strict Mode でのダブル実行にも安全であること

## 受入条件
- [ ] AC-01: `boundsFilterEnabled` が `false` の状態で地図を操作しても `fetchPosts` が再実行されないこと
- [ ] AC-02: `boundsFilterEnabled` が `true` の状態で地図を操作した際、デバウンス（300ms）後に 1 回だけフェッチが実行されること
- [ ] AC-03: フィルタ（種別・市町村・期間等）変更時はデバウンス後にフェッチが実行されること
- [ ] AC-04: React DevTools Profiler で不要な再レンダリングが発生していないことを確認できること
- [ ] AC-05: 既存のテスト `src/hooks/__tests__/usePostList.test.ts` がパスすること

## 影響範囲
- `src/views/HomePage.tsx` (L108-111, L132-138)
- `src/hooks/usePostList.ts` (L32-77, L79-98)

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 地図操作のたびに不要なフェッチが発生する可能性があり、ユーザー体験（ラグ・スピナー表示）および Supabase API 消費量に直接影響する。本番稼働中のパフォーマンス問題として早急な対応が必要。
