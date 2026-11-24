# REQ-190: 認証イベント起点の参照変化で全画面再レンダー・調査依頼の二重/過剰フェッチが起きる

## 背景
ザリダスの認証状態は `src/context/AuthContext.tsx` の `AuthProvider` が一元管理し、`useAuth` を介して約20コンポーネントが `user` を消費する。Supabase Auth はセッションのトークンリフレッシュ（約1時間毎）やタブ復帰時に `onAuthStateChange` を発火させ、その都度新しい `session` オブジェクトを返す。

`useAuth` の `user` は多数のコンポーネントの再レンダーと `useEffect` 依存に使われるため、`user` の参照（identity）安定性は地図開きっぱなしのような長時間利用時のパフォーマンスに直結する。

## 現状の問題
認証イベント（特にトークンリフレッシュ・タブ復帰）を起点に、ユーザー実体が同一でも `user` の参照が変化し、(1) 全 `useAuth` 消費者の再レンダー、(2) 調査依頼の不要な再フェッチ、が連鎖して発生する。

### 課題1: `onAuthStateChange` が常に新規 `user` を `setUser` し、context value が参照変化する
`src/context/AuthContext.tsx:43-46`:
```ts
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  setUser(session?.user ?? null)
})
```
- `TOKEN_REFRESHED`（約1時間毎）やタブ復帰時の `SIGNED_IN` でも、`_event` を区別せず無条件に `setUser(session?.user ?? null)` を呼ぶ。`session.user` は毎回**新しいオブジェクト**のため、ユーザー実体（`id` 等）が同一でも `user` の参照が変わる。
- `AuthProvider` の context value は `useMemo(..., [user, loading, ...])`（`AuthContext.tsx:63-65`）で `user` を依存に含むため、`user` 参照変化で value が再生成され、**全 `useAuth` 消費者（約20コンポーネント）が再レンダー**する。
- さらに `user` を依存に持つ `useEffect` が連鎖再実行する。例として `src/app/(home)/HomeInteractive.tsx:137-145`（`pendingSurveyRequestSeed` と `user` 依存）、`:167-172`（`pendingAuthTab`・`user`・`authLoading` 依存）。地図を開いたまま放置すると、トークンリフレッシュの度に全画面が再レンダーされる。

### 課題2: `useSurveyRequests` が `user` を無条件に依存に含み、二重/過剰フェッチを誘発する
`src/hooks/useSurveyRequests.ts:60-97` の `fetchRequests`（`useCallback`）は、依存配列に `user` を無条件で含む（`:97`）。
```ts
}, [filters.status, filters.species, filters.municipality, filters.owner, filters.sort, user])
```
しかし `user` を実際に使うのは `filters.owner === 'me'` のとき**だけ**（`:85-87`）。
```ts
if (filters.owner === 'me' && user) {
  query = query.eq('user_id', user.id)
}
```
ホーム画面は `useSurveyRequests()` を `owner` 未指定で呼び（`src/app/(home)/HomeInteractive.tsx:118`）、`useEffect(() => { fetchSurveyRequests() }, [fetchSurveyRequests])`（`:119`）で監視している。そのため:
- **初回マウント時の二重フェッチ**: `AuthProvider` の初期化で `user` が `null`（初期値）→ `getSession()` 解決後に `user` がセット（`AuthContext.tsx:35-37`）と 2 段階で変化し、`fetchRequests` の参照が変わって `:119` のエフェクトが再実行される。結果、`survey_requests`（最大 200 行 × 12 列、`useSurveyRequests.ts:67,89`）のクエリが「user=null で 1 回 → 解決後にもう 1 回」と二重に走る。
- **ログイン中の過剰フェッチ**: トークンリフレッシュ（課題1）で `user` 参照が変わる度に `fetchRequests` も再生成され、`owner` を使っていないホームでも `survey_requests` が再フェッチされる。

## 目的
ユーザー実体が変わっていない認証イベントでは `user` の参照を維持し、不要な再レンダー連鎖を止める。また `useSurveyRequests` の `fetchRequests` の依存を「実際に使う値（`owner==='me'` 時の `user.id`）」に限定し、ホーム初回マウントの二重フェッチとリフレッシュ毎の過剰フェッチを排除する。

## 要件
### 機能要件
- [ ] FR-190-01: `AuthProvider`（`src/context/AuthContext.tsx:43-46`）の `onAuthStateChange` ハンドラを、`setUser(prev => ...)` の関数更新に変更し、新 `session.user` が前回の `user` と**実質的に同一**（少なくとも `id`、必要に応じて `email_confirmed_at`・`app_metadata.role` 等、本アプリが派生に使う属性が一致）なら `prev` を返して参照を維持し、異なる場合のみ新値をセットする。
- [ ] FR-190-02: 同一判定はサインアウト/サインインの実体変化（`null ⇄ user`、別ユーザーへの切替）を正しく検知できること。`isAdmin`（`AuthContext.tsx:60`）・`isEmailConfirmed`（`:61`）の派生に使う属性が変化した場合は新値として扱う。
- [ ] FR-190-03: 初期化時の `getSession()`（`AuthContext.tsx:35-37`）の `setUser` も、FR-190-01 の同一判定と矛盾しない形にする（初回は `null → user` で正しく更新される）。
- [ ] FR-190-04: `useSurveyRequests` の `fetchRequests`（`src/hooks/useSurveyRequests.ts:60-97`）で、`user` を直接依存に含めるのをやめ、`const ownerId = filters.owner === 'me' ? (user?.id ?? null) : null` を導出して依存配列（`:97`）に `ownerId` を用いる。フィルタ適用箇所（`:85-87`）も `ownerId` ベースに整合させる。
- [ ] FR-190-05: 上記により、`owner` 未指定のホーム（`HomeInteractive.tsx:118`）では `user` 参照変化に追従して `fetchRequests` が再生成されない（＝再フェッチが起きない）こと。`owner==='me'` の画面では、ログイン/ログアウトや別ユーザー切替時には正しく再フェッチされること。

### 非機能要件（該当する場合のみ）
- [ ] NFR-190-01: 認証イベントによる不要再レンダー・再フェッチの削減により、地図を開いたままの長時間利用時に、トークンリフレッシュ（約1時間毎）で全画面再レンダーや `survey_requests` 再フェッチが発生しないこと。
- [ ] NFR-190-02: 既存の認証フロー（ログイン・ログアウト・退会、`AuthContext.tsx:50-58`）と `loading` 状態管理の挙動を退行させないこと。

## 受入条件
- [ ] AC-01: `AuthProvider` のユニットテストで、`onAuthStateChange` に `TOKEN_REFRESHED`（`session.user` は別オブジェクトだが `id` 等が同一）を発火させても、`useAuth` の `user` 参照が変化せず、消費コンポーネントの再レンダーが発生しないことを検証する。
- [ ] AC-02: 同テストで、`SIGNED_OUT`（`session=null`）・別ユーザーでの `SIGNED_IN`（`id` 変化）では `user` が正しく更新され、再レンダーが起きることを検証する。
- [ ] AC-03: `useSurveyRequests`（`owner` 未指定）を使うホーム相当のセットアップで、初回マウント時に `survey_requests` フェッチが**1回だけ**実行される（user の null→解決による二重フェッチが起きない）ことをテストで検証する。
- [ ] AC-04: `owner==='me'` 指定時は、ログイン状態の確定・ログアウト・別ユーザー切替で `fetchRequests` が再実行され、自分の依頼のみが取得されることを検証する。
- [ ] AC-05: 既存テスト（`src/context/__tests__/AuthContext.test.tsx` 等）が引き続き通過し、`next build` と型チェックがエラーなく完了する。

## 影響範囲
- `src/context/AuthContext.tsx`（`onAuthStateChange`/`getSession` の `setUser`、`:35-46`）
- `src/hooks/useSurveyRequests.ts`（`fetchRequests` の依存とフィルタ、`:60-97`）
- `src/app/(home)/HomeInteractive.tsx`（再レンダー/エフェクト連鎖の受け手。直接改修は不要だが回帰確認対象、`:118-119`, `:137-172`）
- `useAuth` 消費者全般（約20コンポーネント。再レンダー削減の恩恵を受ける）
- `src/context/__tests__/AuthContext.test.tsx`（テスト追加）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 機能は正常だが、トークンリフレッシュ（約1時間毎）やタブ復帰の度に全画面再レンダーと `survey_requests` の過剰フェッチが連鎖し、地図常用ユーザーの体感・電力・データ転送に継続的な負荷を与える。修正は局所的（`setUser` の同一判定と依存配列の絞り込み）で副作用が小さく、費用対効果が高い。
