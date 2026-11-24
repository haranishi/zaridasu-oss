# REQ-156: user の非 null assertion (user!) 多用と早期 null ガードの導入

## 背景
ザリダス (Next.js 15 + Supabase) では、認証ユーザーを `useAuth()` (`src/context/AuthContext.tsx`) から取得する。`AuthContext` の型定義は以下の通り、`user` は `User | null` を返す（`AuthContext.tsx:9` の `user: User | null`、`:31` の `useState<User | null>(null)`、`:36` / `:44` で `session?.user ?? null` を設定）。つまり `user` は未認証時・初期ロード時に `null` になり得る。

しかし管理画面の各操作ハンドラでは、`user` が必ず存在する前提で非 null assertion `user!.id` を多用しており、型上の null 可能性を握り潰している。

## 現状の問題
`src/views/admin/AdminPostsPage.tsx` では `const { user } = useAuth()` (`:36`) で取得した `user` を、null チェックなしに `user!.id` として以下の箇所で参照している。
- `:124` — `handleApprove` 内 `reviewed_by: user!.id`
- `:128` — `handleApprove` 内 監査ログ `adminId: user!.id`
- `:147` — `handleReject` 内 `reviewed_by: user!.id`
- `:151` — `handleReject` 内 監査ログ `adminId: user!.id`
- `:205` — `handleBulkDelete` 内 監査ログ `adminId: user!.id`
- `:232` — `handleBulkApprove` 内 `reviewed_by: user!.id`
- `:236` — `handleBulkApprove` 内 監査ログ `adminId: user!.id`
- `:312` — `handleToggleOfficial` 内 監査ログ `adminId: user!.id`
- `:362` — `handleDelete` 内 監査ログ `adminId: user!.id`

同様のパターンは他の管理画面にも存在する（横展開検討対象）。
- `src/views/admin/AdminCommentsPage.tsx:109` — `adminId: user!.id`
- `src/views/admin/AdminReportsPage.tsx:132` / `:155` — `adminId: user!.id`

### 影響
- `user` が `null` の状態でこれらのハンドラが実行されると、`user!.id` は実行時に `Cannot read properties of null (reading 'id')` を投げる。管理画面は認証・admin ロード後にレンダリングされる前提だが、ロードのタイミング次第（セッション失効・初期化途中・直接遷移）で `null` になり得る。
- 非 null assertion は型の保証をコードレビューと実行順序の暗黙的前提に委ねており、型安全性が失われている。

## 目的
- ページ／コンポーネントの先頭で `user` の null を一度だけ早期ガードし、以降のハンドラでは非 null assertion を使わずに型安全に `user.id` を参照できるようにする。
- 未認証・ロード中の状態で操作ハンドラが実行されないことを保証する。

## 要件
### 機能要件
- [ ] FR-156-01: `AdminPostsPage` のコンポーネント本体先頭で `user`（および必要なら `loading`）に基づく早期 null ガードを実装する。`user` が `null`／ロード中の場合は操作 UI を描画せず、ロード表示やリダイレクト等の適切なフォールバックを返す。
- [ ] FR-156-02: 早期ガード導入後、`AdminPostsPage.tsx:124, 128, 147, 151, 205, 232, 236, 312, 362` の `user!.id` をすべて `user.id` に置き換え、非 null assertion を排除する。型が絞り込まれていることをコンパイラで確認する。
- [ ] FR-156-03: 同種の `user!.id` を使う他の管理画面 (`AdminCommentsPage.tsx:109`、`AdminReportsPage.tsx:132, 155`) にも同じ早期ガード方針を横展開する。
- [ ] FR-156-04: ハンドラ単位でガードが必要な場合（先頭ガードで型が絞れないケース）は、各ハンドラ冒頭で `if (!user) return` 等の明示チェックを行い、`!` を使わない。

### 非機能要件（該当する場合）
- [ ] NFR-156-01: ESLint の `@typescript-eslint/no-non-null-assertion` 等で、今後の非 null assertion 追加を抑止することを検討する。
- [ ] NFR-156-02: 既存の正常系（認証済み admin での承認・却下・削除・一括操作・公式化）の挙動を変えないこと。

## 受入条件
- [ ] AC-01: `AdminPostsPage.tsx` 内に `user!` が存在しない。
- [ ] AC-02: `user` が `null`／ロード中のとき、承認・却下・削除等のハンドラが呼び出される UI が描画されない（または安全に早期 return する）。
- [ ] AC-03: 認証済み admin では承認・却下・削除・一括操作・公式化が従来通り動作する。
- [ ] AC-04: `tsc --noEmit` とビルドが成功する。
- [ ] AC-05: （横展開対象とした場合）`AdminCommentsPage` / `AdminReportsPage` でも `user!` が排除されている。

## 影響範囲
- `src/views/admin/AdminPostsPage.tsx`（主対象）
- `src/views/admin/AdminCommentsPage.tsx`、`src/views/admin/AdminReportsPage.tsx`（横展開）
- `src/context/AuthContext.tsx`（`user` 型の参照元。変更は不要だが前提として確認）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 通常フローでは認証後にのみ管理画面が表示されるため即時クラッシュは稀だが、セッション失効や初期化タイミング次第で実行時 null 参照エラーを起こし得る。非 null assertion の多用は型安全性を損ない、早期ガードへの集約で根本的に解消できる。
