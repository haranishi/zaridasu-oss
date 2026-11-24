# REQ-164: 一部 fetch の AbortSignal 未管理と未使用 state (dead code) の整理

## 背景
ザリダス (Next.js 15 + Supabase) のクライアントフック・画面では、非同期データ取得を `useEffect` 内で行う。アンマウントや依存変更で取得中のリクエストが残る場合、結果がアンマウント済みコンポーネントへ反映されると React の警告や不要な状態更新を招く。これを避けるため `AbortController` / `AbortSignal` でガードするのが標準パターンだが、一部フックで未適用のものが残っている。また、利用されない state（dead code）も混在している。

実コードを確認した上での現状は以下の通り。

## 現状の問題

### 1. AbortSignal の適用が不揃い（一部フックで未管理）
`src/hooks/useProfile.ts` 内のフックで AbortSignal の扱いに差がある。
- `useProfile` (`:26-49`): `fetchProfile(signal?: AbortSignal)` が signal を受け取り、`useEffect` (`:45-49`) で `AbortController` を生成・`abort()` してガードしている。**適用済み**。
- `useRanking` (`:83-104`): `useEffect` (`:87-104`) 内で `AbortController` を生成し、`controller.signal.aborted` をチェックして状態更新をガードしている。**適用済み**。
- `useBadgeDefinitions` (`:118-132`): `useEffect` (`:121-129`) で `badge_definitions` を取得するが、`AbortController` / signal を一切使っていない。アンマウント後でも `.then(({ data }) => { if (data) setBadges(...) })` (`:128`) が実行され、アンマウント済みコンポーネントへ `setBadges` する可能性がある。
  ```ts
  useEffect(() => {
    if (!navigator.onLine) return
    supabase
      .from('badge_definitions')
      .select('id, name, description, icon, sort_order')
      .order('sort_order')
      .then(({ data }) => { if (data) setBadges(data as unknown as BadgeDefinition[]) })
  }, [])
  ```
  ※ `useProfile` / `useRanking` の signal チェックは「abort 後に state 更新しない」ための実装だが、Supabase クエリ自体への signal 受け渡し（実際のリクエストキャンセル）は行われていない点も合わせて見直し対象とする。

### 2. 未使用 state (dead code)
`src/views/admin/AdminPostsPage.tsx:50` で削除中フラグの state を宣言しているが、setter のみ使用され、値 `_deleting` はどこからも参照されていない（`_` プレフィックスで未使用を明示）。
```ts
const [_deleting, setDeleting] = useState(false)
```
`setDeleting(true)` は `handleDelete` 内 (`:327`)、`setDeleting(false)` は `:381` (`finally`) で呼ばれているが、`_deleting` の値自体は JSX・ロジックのどこでも使われていない。削除ダイアログのボタン無効化等に本来使うはずだったフラグが宙に浮いている可能性がある（`DeletePostDialog` には `deleting` prop が渡されていない — `:740-747`）。

### 影響
- `useBadgeDefinitions`: アンマウント／高速再マウント時に取得結果が遅れて到着し、解放済みコンポーネントへの state 更新となる。React 18 では警告は緩和されたが、不要な再レンダリングや一貫性のない state の原因になり得る。
- `_deleting`: 削除処理中のローディング表示・二重送信防止が実際には機能していない（削除ボタンが処理中も押せる）可能性。少なくとも未使用 state はノイズであり、意図不明なまま残っている。

## 目的
- クライアント取得フックの AbortSignal 管理方針を統一し、アンマウント後の state 更新を一貫して防ぐ。
- 未使用 state を除去するか、本来の用途（削除中のボタン無効化等）に正しく接続する。

## 要件
### 機能要件
- [ ] FR-164-01: `useBadgeDefinitions` (`useProfile.ts:118-132`) に `AbortController` を導入し、`useProfile` / `useRanking` と同様にアンマウント後の `setBadges` をガードする。可能なら Supabase クエリへ `abortSignal(signal)` を渡し、リクエスト自体のキャンセルも行う。
- [ ] FR-164-02: `AdminPostsPage.tsx:50` の `_deleting` について、次のいずれかを行う。
  - (a) 削除中ローディング・二重送信防止に本来必要であれば、`deleting` として参照を復活させ、`DeletePostDialog`（`:740-747`）等へ渡してボタン無効化に使う。
  - (b) 不要であれば state ごと削除し、`setDeleting` 呼び出し (`:327`, `:381`) も整理する。
- [ ] FR-164-03: （任意・横展開）プロジェクト内の他の `useEffect` 内 Supabase 取得で AbortSignal 未管理のものがあれば棚卸しし、方針を統一する。

### 非機能要件（該当する場合）
- [ ] NFR-164-01: ESLint の未使用変数ルール (`no-unused-vars` / `@typescript-eslint/no-unused-vars`) で、`_` プレフィックスに頼らず未使用 state を検知できる運用を検討する。
- [ ] NFR-164-02: 変更後もバッジ表示・削除処理の挙動が従来通りであること（リグレッションなし）。

## 受入条件
- [ ] AC-01: `useBadgeDefinitions` がアンマウント／依存変更時に取得をガードし、解放後の `setBadges` が発生しない。
- [ ] AC-02: `AdminPostsPage.tsx` の `_deleting` が削除され、または `deleting` として実際に UI（ボタン無効化等）へ接続される。
- [ ] AC-03: `tsc --noEmit`・lint・ビルドが成功し、未使用変数の警告が出ない。
- [ ] AC-04: バッジ一覧表示と投稿削除（単体・一括）が従来通り動作する。

## 影響範囲
- `src/hooks/useProfile.ts`（`useBadgeDefinitions`）
- `src/views/admin/AdminPostsPage.tsx`（`_deleting` と削除フロー）
- `src/components/modals/DeletePostDialog`（`deleting` を接続する場合）

## 優先度
- **緊急度**: 低 / **重要度**: 中 / **理由**: 即座のクラッシュには直結しないが、AbortSignal の取り扱いが不揃いだとアンマウント後の state 更新による不安定さが残り、未使用 state は二重送信防止が機能していないバグの兆候でもある。コード品質・一貫性の改善として整理する価値がある。
