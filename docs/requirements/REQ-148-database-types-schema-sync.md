# REQ-148: DB 型定義 (database.types.ts) と実スキーマの info_type 不整合

## 背景
ザリダス (Next.js 15 + Supabase) では、Supabase の DB スキーマを TypeScript 型へ反映した `src/types/database.types.ts` をアプリ全体の型の単一ソースとして使用している。`src/types/index.ts` はこの生成型を再エクスポートし、`Post` 型等を提供する。

`posts.info_type` は当初 4 値 (`sighting` / `capture` / `trace` / `damage`) だったが、後から「不在確認 (absence)」機能 (schema.sql の「11. 不在確認（absence）機能」セクション) が追加され、DB の CHECK 制約は 5 値に拡張された。しかし手書き管理されている `database.types.ts` がこの追加に追従しておらず、型定義と実 DB スキーマが乖離している。

## 現状の問題
- `src/types/database.types.ts:17`（posts.Row）、`:34`（posts.Insert）、`:49`（posts.Update）の `info_type` がいずれも以下の 4 値リテラル union で定義されており、`'absence'` が欠落している。
  ```ts
  info_type: 'sighting' | 'capture' | 'trace' | 'damage'
  ```
- 一方、実スキーマ `supabase/schema.sql` では `'absence'` を含む 5 値が正しく定義されている。
  - `supabase/schema.sql:19`（posts テーブル定義の初期 CHECK 制約）:
    ```sql
    info_type TEXT NOT NULL CHECK (info_type IN ('sighting', 'capture', 'trace', 'damage', 'absence')),
    ```
  - `supabase/schema.sql:840-842`（後続の制約再定義。`absence` 追加コメント付き）:
    ```sql
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_info_type_check;
    ALTER TABLE posts ADD CONSTRAINT posts_info_type_check
      CHECK (info_type IN ('sighting', 'capture', 'trace', 'damage', 'absence'));
    ```
- `'absence'` は実際にビジネスロジックで使用されている。`supabase/schema.sql:707` のバッジ集計トリガで以下のように参照される。
  ```sql
  SELECT COUNT(*) INTO v_absence_count FROM posts WHERE user_id = v_user_id AND status = 'approved' AND info_type = 'absence';
  ```
  この件数が 5 件以上で `absence_reporter` バッジが付与される (`schema.sql:708`)。
- なお `src/types/index.ts:14` のドメイン型 `InfoType` は `'sighting' | 'capture' | 'trace' | 'damage' | 'absence'` と正しく 5 値で定義されている。つまり、生成型 (`database.types.ts` 由来の `Post.info_type`) とドメイン型 (`InfoType`) で `info_type` の許容値が食い違っているという二重定義・不整合状態になっている。

### 影響
- `Post['info_type']` を直接扱うコードでは `'absence'` が型エラー扱いになり得る。`absence` を含む投稿を生成型ベースで処理する箇所で TypeScript が網羅性チェックを誤る、または `as` キャストで握り潰す要因になる。
- 今後 `info_type` の値が増減した際、手書き型と実 DB の差分を機械的に検知できないため、同種のドリフトが再発する。

## 目的
- `database.types.ts` の `info_type` を実 DB スキーマ (`absence` を含む 5 値) と一致させ、型の単一ソースとしての正確性を回復する。
- スキーマと生成型の同期を継続的に担保し、ドリフトの再発を CI で検知できるようにする。

## 要件
### 機能要件
- [ ] FR-148-01: `src/types/database.types.ts` の posts.Row (`:17`)、posts.Insert (`:34`)、posts.Update (`:49`) の `info_type` を、`'sighting' | 'capture' | 'trace' | 'damage' | 'absence'` の 5 値 union に修正する。
- [ ] FR-148-02: 修正後、`src/types/index.ts:14` の `InfoType` と `Post['info_type']` の許容値が完全に一致することを確認する（将来的には `InfoType` を生成型から導出する形に統一することを検討）。
- [ ] FR-148-03: 可能であれば `npx supabase gen types typescript` による自動生成手順を整備し、手書き編集による差分混入を減らす。ファイル冒頭 (`database.types.ts:1-4`) に記載された生成コマンドの再現性を確認する。

### 非機能要件（該当する場合）
- [ ] NFR-148-01: スキーマ (`supabase/schema.sql` / migrations) と `database.types.ts` の同期を検証する CI チェックを追加する。生成型を再生成して差分があれば CI を失敗させる、または型と CHECK 制約の許容値が一致するかを検査する仕組みとする。
- [ ] NFR-148-02: 修正は型のみの変更とし、実行時の挙動・DB スキーマには影響を与えないこと。

## 受入条件
- [ ] AC-01: `database.types.ts` の posts の Row / Insert / Update いずれの `info_type` も `'absence'` を含む。
- [ ] AC-02: `info_type: 'absence'` を持つ `Post` 値が型エラーなしでコンパイルできる。
- [ ] AC-03: `tsc --noEmit`（型チェック）およびビルドが成功する。
- [ ] AC-04: スキーマと型の同期を検証する CI チェックが追加され、意図的に片方をずらすとチェックが失敗することを確認できる。

## 影響範囲
- `src/types/database.types.ts`（直接修正）
- `src/types/index.ts`（`Post` / `InfoType` の一致確認）
- `posts.info_type` を参照する全コンポーネント・フック（型チェックの再評価対象。実行時挙動は不変）
- CI 設定（同期チェック追加）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 実行時バグではなく型の不正確さだが、型の単一ソースが実 DB と乖離しているため、`absence` を扱うコードで型安全性が損なわれ、`as` キャストでの握り潰しを誘発する。ドリフト検知の仕組みがないため再発リスクも高い。
