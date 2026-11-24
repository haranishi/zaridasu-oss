## 目的

1. 公開検索の `.or()` 句で攻撃者が任意のフィルタを差し込めない状態にする（真の injection 対策）
2. admin 検索の `.ilike()` でワイルドカードを無効化し、DoS と意図しないマッチを防ぐ
3. 同種の脆弱性が将来再発しないよう、エスケープを共通ユーティリティに集約する
4. 中期的には textSearch（GIN index 利用）への移行余地を残し、`.or()` 連打を解消する

## 要件

### 機能要件

- [ ] **FR-138-01: PostgREST 値エスケープユーティリティ**
  `src/lib/postgrest.ts` を新設し、以下のヘルパーを公開:
  ```ts
  /**
   * PostgREST の .or() / .filter() に渡す「値」部分をエスケープする。
   * カンマ・括弧・ドット・ダブルクォート・バックスラッシュを処理。
   * 戻り値は "..." でクオートされる前提で、内部の特殊文字のみ \" 等に置換。
   */
  export function escapePostgrestValue(input: string): string

  /**
   * ilike / like のパターン用に % / _ / \ をエスケープする。
   * 戻り値はワイルドカードを含まないリテラルマッチ用文字列。
   */
  export function escapeIlikePattern(input: string): string
  ```
  - `escapePostgrestValue`: `,` `(` `)` `"` `\` を含む値を PostgREST が誤解釈しないよう、値全体を `"..."` でクオートして埋め込む形に整える。実装は PostgREST 公式の "Quoted reserved characters" 仕様に従う。
  - `escapeIlikePattern`: `\\` → `\\\\`、`%` → `\\%`、`_` → `\\_` の順で置換。バックスラッシュを最初に処理することで二重置換を避ける。

- [ ] **FR-138-02: 公開検索の `.or()` 句修正**
  `src/hooks/usePostList.ts:50-66` を以下に書き換え:
  ```ts
  if (filters.search) {
    const kw = filters.search.toLowerCase()
    const matchedSpecies = SPECIES.filter(s => s.label.includes(kw)).map(s => s.value)
    const matchedInfoTypes = INFO_TYPES.filter(t => t.label.includes(kw)).map(t => t.value)
    const safePattern = escapeIlikePattern(filters.search)
    const orParts = [
      `comment.ilike."*${safePattern}*"`,
      `municipality.ilike."*${safePattern}*"`,
      ...(matchedSpecies.length ? [`species.in.(${matchedSpecies.map(escapePostgrestValue).join(',')})`] : []),
      ...(matchedInfoTypes.length ? [`info_type.in.(${matchedInfoTypes.map(escapePostgrestValue).join(',')})`] : []),
    ]
    query = query.or(orParts.join(','))
  }
  ```
  PostgREST の `.or()` 構文では `%` が URL エンコードされた状態を期待するため、`%` ではなく `*` を ilike のワイルドカードとして使う（PostgREST が `*` を `%` に変換する仕様）。値内部の `*` リテラルは escapeIlikePattern が処理しないため、`*` も同様にエスケープ対象に追加する。
