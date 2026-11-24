# REQ-038: usePostForm の postData.position null ガード追加

## 背景
`usePostForm` の投稿送信処理は `postData.position` を前提にしているが、型定義上は `position: LatLng | null`（`src/types/index.ts:56-68`）であり null を取り得る。現状は `postData.position!` と non-null assertion で強制しており、直前のバリデーションは `AKITA_BOUNDS`（緯度経度の範囲）チェックのみで、`position` 自体が null かどうかの事前確認が存在しない。呼び出し経路（ショートカット送信、オフライン復帰送信など）が増えたとき、ランタイムで `TypeError: Cannot read properties of null (reading 'lat')` を発生させる危険がある。

## 現状の問題
- `src/hooks/usePostForm.ts:184-185` オンライン投稿の submitPost 内で non-null assertion により null チェックなしに `.lat` / `.lng` を参照。

  ```ts
  // 入力値バリデーション (FR-003) — 写真アップロード前に実行し、孤立ファイルを防ぐ
  const lat = postData.position!.lat
  const lng = postData.position!.lng
  if (lat < AKITA_BOUNDS.latMin || lat > AKITA_BOUNDS.latMax ||
      lng < AKITA_BOUNDS.lngMin || lng > AKITA_BOUNDS.lngMax) {
    setError('位置情報が秋田県の範囲外です。地図上で正しい位置を選択してください。')
    return false
  }
  ```

- `src/hooks/usePostForm.ts:278-279` オフライン下書き保存の `saveOffline` でも同様に `postData.position!.lat/lng` を参照。

  ```ts
  await addPendingPost(
    {
      lat: postData.position!.lat,
      lng: postData.position!.lng,
      species: postData.species,
      ...
  ```

- `src/types/index.ts:56-68` で `position: LatLng | null` と null を明示している以上、non-null assertion は型安全性の破壊。

  ```ts
  export interface PostFormData {
    position: LatLng | null
    species: Species
    ...
  }
  ```

## 目的
- `submitPost` / `saveOffline` の先頭で `postData.position` の存在を明示的に確認し、未選択時に日本語エラーメッセージを表示して早期 return することでランタイムクラッシュを防ぐ。
- 併せて non-null assertion (`!`) を排除し、型安全性を回復する。

## 要件

### 機能要件
- [ ] FR-038-01: `submitPost` の先頭（既存バリデーションより前）で以下のガードを追加する。
  ```ts
  const pos = postData.position
  if (!pos) {
    setError('地図で位置を選択してください。')
    return false
  }
  ```
  以降 `pos.lat` / `pos.lng` を使用し、`postData.position!` の non-null assertion を除去する。
- [ ] FR-038-02: `saveOffline` の先頭にも同様の `position` 存在チェックを追加し、未選択時は `setError('地図で位置を選択してください。')` で早期 return する。`postData.position!` を除去する。
- [ ] FR-038-03: エラーメッセージは日本語で、既存の `setError` 経由で UI に表示されること。
- [ ] FR-038-04: 既存の `AKITA_BOUNDS` 範囲チェック、コメント長チェック、個体数チェックは従来通り動作し、順序に影響しないこと。

### 非機能要件
- [ ] NFR-038-01: TypeScript の `strict` モードおよび既存の lint ルール（`@typescript-eslint/no-non-null-assertion` 等）を満たすこと。

## 受入条件
- [ ] AC-01: `position` 未選択の状態で投稿ボタンを押すと「地図で位置を選択してください。」が表示され、API 呼び出し・写真アップロードは発生しない。
- [ ] AC-02: `position` 未選択状態でオフライン保存（`saveOffline`）を実行しても IndexedDB への書き込みが発生せず、同じエラーメッセージが表示される。
- [ ] AC-03: `position` が設定済みの場合、従来通り AKITA_BOUNDS チェックと後続処理が実行される（既存テスト `src/hooks/__tests__/usePostForm.test.ts` が全て通る）。
- [ ] AC-04: `tsc --noEmit`（または `pnpm typecheck`）が、`usePostForm.ts` 内で non-null assertion なしにパスする。
- [ ] AC-05: 既存のユニットテスト／E2E テスト全てがグリーン。

## 影響範囲
- 変更対象ファイル
  - `src/hooks/usePostForm.ts`
  - 必要に応じて関連テスト `src/hooks/__tests__/usePostForm.test.ts`

## 優先度
- **緊急度**: High
- **重要度**: Medium
- **理由**: 型定義上 null を許容する状態で non-null assertion を使っているため、経路追加時にランタイムクラッシュが発生し得る。ユーザー影響は UI ロック＋再送不能で大きいが、現状の UI フロー上は発生頻度が限定的であるため重要度は Medium。

