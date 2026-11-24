# REQ-008: useLike フックの finally ブロック欠如によるUIロック

## 背景

`useLike.ts` の `toggleLike()` 関数では、いいねの切り替え処理後に `setLikeLoading(false)` と `togglingRef.current = false` で状態をリセットしているが、これらが `try-catch-finally` の `finally` ブロックではなく `catch` ブロックの後（try-catch構造の外側）に配置されている。`catch` ブロック内でSupabaseへのリカバリクエリ（サーバー状態の再取得）が実行されており、このクエリが例外をスローした場合、`setLikeLoading(false)` に到達せずいいねボタンが永続的に無効化される。

## 現状の問題

- **`src/hooks/useLike.ts:50`**: `setLikeLoading(true)` でローディング状態を開始。
- **`src/hooks/useLike.ts:51-62`**: `try` ブロックでいいねの挿入/削除を実行。
- **`src/hooks/useLike.ts:63-69`**: `catch` ブロックでサーバー状態を再取得するためにSupabaseクエリを2つ実行（L64: `likes` テーブルのカウント取得、L67: ユーザーのいいね状態確認）。これらのクエリが失敗した場合（ネットワーク断、Supabase障害等）、未捕捉の例外がスローされる可能性がある。
- **`src/hooks/useLike.ts:71-72`**: `setLikeLoading(false)` と `togglingRef.current = false` が `catch` ブロックの後（`try-catch` 構造の外側）に配置されている。`catch` 内の例外が伝播した場合、これらの行は実行されない。
- **`src/hooks/useLike.ts:49`**: `togglingRef.current` による排他制御（FR-027）も `false` にリセットされないため、以降のいいね操作が完全にブロックされる。

### 再現シナリオ

1. ユーザーがいいねボタンをクリック。
2. Supabaseへの挿入/削除リクエストが失敗（ネットワークエラー等）。
3. `catch` ブロックに入り、リカバリとしてサーバー状態の再取得クエリを実行。
4. リカバリクエリも失敗（ネットワークが復旧していない等）。
5. `catch` ブロック内の例外が未捕捉のまま伝播。
6. L71-72の `setLikeLoading(false)` と `togglingRef.current = false` が実行されない。
7. `likeLoading` が `true` のまま、`togglingRef.current` が `true` のままとなり、いいねボタンが永続的に無効化される。
8. ページをリロードするまで回復不能。

## 目的

`toggleLike()` 関数のクリーンアップ処理（ローディング状態のリセットと排他フラグの解除）を `finally` ブロックに移動し、例外発生時でも確実にUIが復旧するようにする。

## 要件

### 機能要件

- [ ] FR-008-01: `src/hooks/useLike.ts` の `toggleLike()` 関数で `setLikeLoading(false)` と `togglingRef.current = false` を `finally` ブロックに移動する。
- [ ] FR-008-02: `catch` ブロック内のリカバリクエリ（L64-68）自体も `try-catch` でラップし、リカバリ失敗時にも安全に処理が継続するようにする。

### 非機能要件

- [ ] NFR-008-01: いいね操作のエラーリカバリ後、ユーザーが再操作可能になるまでの時間が3秒以内であること。

## 受入条件

- [ ] AC-01: `toggleLike()` 関数の `setLikeLoading(false)` と `togglingRef.current = false` が `finally` ブロック内に配置されていること。
- [ ] AC-02: ネットワーク切断状態でいいねボタンを押した後、ネットワーク復旧時にいいねボタンが再び操作可能であること（ページリロード不要）。
- [ ] AC-03: `catch` ブロック内のリカバリクエリが失敗しても、コンソールに未捕捉例外が出力されないこと。

## 影響範囲

- `src/hooks/useLike.ts` （L41-73: `toggleLike` 関数の try-catch-finally 構造の修正）

## 優先度

- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 通常のネットワーク環境では発生しにくいが、モバイル回線やWi-Fi不安定環境ではネットワーク断が頻繁に発生するため、いいねボタンが押せなくなるUX問題が発生し得る。修正は `finally` ブロックへの移動のみで影響範囲が極めて小さく、安全に実施可能。
