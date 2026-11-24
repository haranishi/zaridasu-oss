# REQ-060: database.types.ts と schema.sql の drift 検出 CI

## 背景
`supabase/schema.sql`（934 行）は本番 DB のスキーマ定義のソース・オブ・トゥルース。一方 `src/types/database.types.ts`（147 行）は Supabase CLI (`supabase gen types typescript`) で **自動生成** される TypeScript 型定義で、全アプリケーションコードが `import type { Database } from '@/types/database.types'` 経由で型を参照する。

- `database.types.ts:2` のコメントで手動編集禁止が明記されているが、強制はされていない
- `.github/workflows/ci.yml` の現行 jobs は `lint` / `type-check` / `build` / `test` のみ（17-27 行目）。`supabase gen types` の diff チェックが無い
- 結果: 開発者が `schema.sql` にカラムを追加しても `database.types.ts` を再生成し忘れると、型と実 DB が drift してランタイムで `null` reference や silent data loss を起こす（例: REQ-003 でも指摘済みの長期課題）

## 守りたい不変条件
- INV-01: PR で `supabase/schema.sql` に変更があれば、CI の drift ジョブが `supabase gen types typescript --local` の出力と `src/types/database.types.ts` を比較し、**差分があれば exit code 1 で落ちる**
- INV-02: ローカルで誤って `database.types.ts` を手動編集してコミットした場合も、CI で drift が検出できる（`supabase gen types` の結果と異なれば失敗）
- INV-03: `schema.sql` を変更せず、`database.types.ts` も再生成しない通常の PR では drift ジョブが 2 分以内にグリーンで完了する（false positive が無い）

## 現状の検出可否
- `.github/workflows/ci.yml` には `supabase` CLI のインストールステップも `gen types` 実行も無い
- ローカルで `git diff` を取らなければ drift は検出不能
- 既存 REQ-003（schema-sync）はドキュメントレベルで存在するが、自動化は未実装

## テスト種別と環境
- 種別: contract テスト（schema-sync / CI レベル）
- フレームワーク:
  - Supabase CLI v2.x (`supabase start` で PostgreSQL コンテナ起動)
  - GitHub Actions (`supabase/setup-cli@v1` or `npx supabase`)
  - `diff -u` または `git diff --no-index --exit-code`
- 配置先:
  - 新規ファイル `.github/workflows/schema-drift.yml`（独立ワークフロー推奨）
  - もしくは `.github/workflows/ci.yml` に `schema-drift` job を追加

## テストケース（CI ステップ / Given/When/Then）

### TC-01 (INV-01): schema 変更を types に反映していない PR を落とす
- Given: PR で `supabase/schema.sql` に新カラム `posts.test_column text` を追加、`src/types/database.types.ts` は未更新
- When: GitHub Actions `schema-drift` job が走る。ステップは以下:
  1. `uses: actions/checkout@v4`
  2. `uses: supabase/setup-cli@v1` with `version: latest`
  3. `supabase start` (Docker compose で local DB 起動)
  4. `supabase db reset --local`（schema.sql から DB 構築）
  5. `supabase gen types typescript --local > .tmp.types.ts`
  6. `diff -u src/types/database.types.ts .tmp.types.ts`
- Then: Step 6 の exit code が 1 になりジョブが失敗、ログに差分が出力される

### TC-02 (INV-02): 手動で database.types.ts を変えただけでも検出
- Given: 開発者が `database.types.ts` を手動で編集して型を追加（実 schema には存在しない）
- When: 同じ CI step を実行
- Then: `supabase gen types --local` の出力には存在しない型が `src/types/database.types.ts` にあるため diff で失敗

### TC-03 (INV-03): drift 無しの PR は通る
- Given: `schema.sql` を変更せず、`database.types.ts` も再生成しない通常の PR
- When: 同じ CI step を実行
- Then: diff は空、ジョブは success。実行時間 <= 3 分

### TC-04: 修復フロー（再生成で drift 解消）
- Given: TC-01 の状態（drift 検出済み）
- When: 開発者がローカルで `npx supabase gen types typescript --local > src/types/database.types.ts` を実行しコミット・push
- Then: 次の CI 実行で drift ジョブが success になる

## カバレッジ目標
- 全 PR で schema-drift ジョブが実行され、`pull_request` トリガーで `paths: ['supabase/schema.sql', 'src/types/database.types.ts']` を監視（全変更に対して実行するならフィルタ無しでも可）
- テーブル追加 / カラム追加 / 型変更 / enum 追加すべてで drift を検出できること

## テストデータ / フィクスチャ
- ローカル検証用サンプル:
  - 「schema.sql 変更のみ」パターン: `ALTER TABLE posts ADD COLUMN test_drift text;` を追加して push
  - 「types.ts 変更のみ」パターン: `database.types.ts` の `Row` interface に手動で `test_drift: string` を追加
- Docker / Postgres 起動のキャッシュは `actions/cache` で `~/.supabase` を対象化

## 受入条件
- [ ] AC-01: `schema.sql` に意図的に `ALTER TABLE posts ADD COLUMN test_drift text` を追加した PR を開くと、`schema-drift` ジョブが red になり、diff ログが Actions UI に出力される
- [ ] AC-02: ネガティブ検証 — drift 対応済み（`database.types.ts` を再生成してコミット）にすると同ジョブが green になる / ジョブの diff ステップを削除すると TC-01 が検出できない
- [ ] AC-03: main ブランチで 3 回連続 drift ジョブが green（schema と types が最初から同期している前提）

## 影響範囲
- `.github/workflows/ci.yml` or 新規 `.github/workflows/schema-drift.yml`
- 開発フロー: `schema.sql` を編集した開発者は `npx supabase gen types typescript --local > src/types/database.types.ts` を実行する必要がある（PR 時に CI が強制）
- CI 実行時間: +2〜3 分（Docker 起動込み）

## 優先度
Medium（型安全性は重要だが、手動レビューで代替可能。長期的な品質維持のため導入推奨）
