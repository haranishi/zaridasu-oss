### テスト要件

- [ ] **FR-138-07: ユニットテスト（Vitest）**
  `src/lib/__tests__/postgrest.test.ts` を新設:
  - `escapePostgrestValue('foo,bar')` → `"foo,bar"` 形式（カンマがクオート内に閉じ込められる）
  - `escapePostgrestValue('a"b')` → `"a\\"b"`（ダブルクォートをエスケープ）
  - `escapeIlikePattern('%abc_')` → `\\%abc\\_`
  - `escapeIlikePattern('a\\b')` → `a\\\\b`（バックスラッシュ）
  - 100 文字超の入力は 100 文字に切り詰める
  - 空文字列・ASCII のみ・日本語混在の正常系

- [ ] **FR-138-08: 公開検索の injection 防止テスト**
  `src/hooks/__tests__/usePostList.test.ts`（既存があれば追記、なければ新設）:
  - **case A**: `filters.search = 'xxx),municipality.eq.abc'` を渡し、生成される PostgREST URL に `municipality.eq.abc` が**フィルタとして現れない**ことを確認（クオート内文字列として扱われる）。
  - **case B**: `filters.search = '%' * 50` のような入力でも生成 URL のサイズが線形にしか増えない（爆発しない）。
  - **case C**: 正常な日本語キーワード `'アメリカザリガニ'` で従来通り `comment.ilike` と `municipality.ilike` 両方の OR 句が生成される。

- [ ] **FR-138-09: Admin posts のワイルドカード無効化テスト**
  `src/views/admin/__tests__/AdminPostsPage.test.tsx`（または同等ファイル）:
  - `filters.keyword = '50%off'` を渡したとき、Supabase `.ilike()` 呼び出しの第二引数が `%50\\%off%` になっている（`%off` の `%` がエスケープ）
  - 正常な日本語キーワードでは regression なし

- [ ] **FR-138-10: E2E (Playwright) — オプション**
  `tests/e2e/search-injection.spec.ts`:
  - 公開検索 UI に `xxx),user_id.eq.some-uuid` を入力 → ネットワークタブで Supabase へのリクエスト URL を確認し、`user_id.eq` が独立フィルタとして送信されていないことを assert。

## 受入条件

- [ ] **AC-138-01**: **Given** 公開検索で `filters.search = 'xxx),municipality.eq.abc'`、**When** `usePostList` が PostgREST クエリを構築、**Then** 生成された URL のクエリ部に `municipality.eq.abc` がトップレベルのフィルタとして含まれない。
- [ ] **AC-138-02**: **Given** `filters.search = 'アメリカザリガニ'`、**When** 同上、**Then** 既存と同じく `comment.ilike` と `municipality.ilike` の OR 句が生成され、検索結果が以前と同一。
- [ ] **AC-138-03**: **Given** admin の `filters.keyword = '50%off'`、**When** `AdminPostsPage.fetchPosts` 実行、**Then** Supabase `.ilike('comment', ...)` の第二引数で `%` が `\\%` にエスケープされている。
- [ ] **AC-138-04**: **Given** admin の `filters.keyword = '___'`（3 連続アンダースコア）、**When** 同上、**Then** `_` が `\\_` にエスケープされ、リテラルマッチで検索される。
- [ ] **AC-138-05**: **Given** `escapeIlikePattern` に 200 文字の入力、**When** 関数呼び出し、**Then** 戻り値の元入力は 100 文字に切り詰められている。
- [ ] **AC-138-06**: **Given** 既存の正常検索動作、**When** 各種日本語キーワードで検索、**Then** 検索結果が REQ-138 適用前と同一（regression なし）。
- [ ] **AC-138-07**: **Given** `escapePostgrestValue` / `escapeIlikePattern` のユニットテスト、**When** Vitest 実行、**Then** 全ケース通過。
