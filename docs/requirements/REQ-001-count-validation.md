# REQ-001: 個体数バリデーションの不整合修正

## 背景
投稿フォームの個体数（count）フィールドに対するバリデーションが、フロントエンドのフォームフック・共通バリデーション関数・データベース制約の3箇所で異なる範囲を許容しており、データ不整合やDBエラーの原因となっている。

## 現状の問題
- `src/hooks/usePostForm.ts:195` — `count < 0 || count > 9999` で範囲チェックしており、**0〜9999** を許容している
  ```typescript
  if (count !== null && (!Number.isFinite(count) || count < 0 || count > 9999 || !Number.isInteger(count))) {
  ```
- `src/lib/postValidation.ts:29` — `COUNT_MIN`(1)〜`COUNT_MAX`(999) で範囲チェックしており、**1〜999** を許容している
  ```typescript
  if (!Number.isInteger(num) || num < COUNT_MIN || num > COUNT_MAX) {
  ```
- `src/lib/constants.ts:169-170` — `COUNT_MIN = 1`, `COUNT_MAX = 999` と定義
- `supabase/schema.sql:26` — DB制約は `CHECK (count > 0 AND count <= 999)` で **1〜999** を許容
- `supabase/migrations/20240101000000_initial_schema.sql:72` — 同様に `CHECK (count > 0 AND count <= 999)`

### 不整合の影響
1. `usePostForm.ts` は `count = 0` を許容するが、DB制約（`count > 0`）で INSERT が失敗する
2. `usePostForm.ts` は `count = 1000〜9999` を許容するが、DB制約（`count <= 999`）で INSERT が失敗する
3. `usePostForm.ts` は共通バリデーション関数 `validatePost()` を使用していない（独自バリデーション）
4. ユーザーにはフロントエンド上では「有効」と見える値がDB投入時にエラーになり、混乱を招く

## 目的
個体数バリデーションをフロントエンド・共通関数・DB制約で統一し、ユーザーが入力した値が確実にDBに保存されるようにする。

## 要件

### 機能要件
- [ ] FR-001-01: `usePostForm.ts` の個体数バリデーションを `postValidation.ts` の `validatePost()` 関数に統一する
- [ ] FR-001-02: `usePostForm.ts` の独自バリデーション（195行目）を削除し、代わりに `validatePost()` を呼び出す
- [ ] FR-001-03: 個体数の有効範囲を全レイヤーで **1〜999** に統一する（DB制約に合わせる）
- [ ] FR-001-04: エラーメッセージを「個体数は1〜999の整数で入力してください」に統一する

### 非機能要件
- [ ] NFR-001-01: フロントエンドバリデーションとDB制約が常に同一範囲であることを、定数（`COUNT_MIN`, `COUNT_MAX`）の一元管理で保証する

## 受入条件
- [ ] AC-01: `count = 0` を入力するとフロントエンドバリデーションでエラーになること
- [ ] AC-02: `count = 1000` を入力するとフロントエンドバリデーションでエラーになること
- [ ] AC-03: `count = 1` および `count = 999` は正常に投稿できること
- [ ] AC-04: `usePostForm.ts` 内で `postValidation.ts` の `validatePost()` が使用されていること
- [ ] AC-05: `count = null`（未入力）は引き続き許容されること

## 影響範囲
- `src/hooks/usePostForm.ts` — バリデーションロジック修正
- `src/lib/postValidation.ts` — 変更なし（既に正しい）
- `src/lib/constants.ts` — 変更なし（既に正しい）
- `supabase/schema.sql` — 変更なし（既に正しい）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: フロントエンドで許容される値がDB制約に違反し、投稿が失敗する。ユーザーが正しく入力したつもりでも500エラーとなるため、UXに直接影響する。
