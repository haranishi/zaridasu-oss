# REQ-314: 定義の単一化とデッドコード整理（bbox判定・バケット名・列リスト・未使用シンボル）

作成日: 2026-07-30
優先度: **P2** ／ 深刻度: **Medium** ／ 種別: コード品質（挙動変更は問題B・問題Aの境界値のみ）
状態: **提案 / 未実装**
関連: REQ-282（プロジェクト整理。ワークストリームD の続き）, REQ-142（admin の select 列リスト定数化。本REQが横展開する既存パターン）, REQ-147（Supabase 変換URLの remotePattern。問題Iで撤去候補になる）, REQ-148（生成型を単一ソースとするドメイン型の導出）, REQ-172/REQ-174（位置来歴・調査手法の品質メタデータ）, REQ-175（実験プラットフォーム）, REQ-003/REQ-060（schema × types の乖離検知）

## 背景

このリポジトリには「単一ソース化」の良い前例が多数ある。`src/lib/constants.ts` への閾値集約（UI にマジックナンバー直書き0件）、`src/lib/admin/columns.ts` の列リスト定数化（REQ-142）、`InfoType = NonNullable<Post['info_type']>` という生成型からの導出（REQ-148、`src/types/index.ts:16`）、XPエンジンの TS / SQL 二重定義を**両側のテストで担保**する設計（`constants.ts:269-291` と `schema.sql:1757-1781`）などである。

本REQが扱うのは、**その規律から個別に漏れて同じ定義が複数箇所に散っている箇所**と、**「定数やヘルパが存在するのに誰も使っていない」ために誤解や実挙動のズレを生んでいる箇所**である。共通する失敗の形は3つ。

1. **同じ述語・同じ文字列・同じ列リストが複数箇所にインライン再実装される** → 片方だけ直して挙動が食い違う（問題A・C・E）
2. **型が生成型より狭い/広い** → 欠落や許容値の緩みをコンパイラが指摘できない（問題B・F）
3. **正規の定義があるのに参照が0件** → 「定数を直せば挙動が変わる」と誤認する（問題G）

いずれも `type-check` / `lint --max-warnings 0` は緑のまま通過する（＝**現在のCIでは検知できない**）。したがって FR は「機械照合の拡張」「述語・定数・列リストの単一化」「型の生成型導出」「デッドコードの削除または復活」の4群に整理する。

---

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と背景のみ）。

- [01-issues-a-c-bbox-exif-bucket.md](REQ-314-single-source-definitions-and-dead-code/01-issues-a-c-bbox-exif-bucket.md) — 問題A（bbox判定が4実装で境界不一致・正規ヘルパ未使用）／問題B（EXIF由来座標が `location_source='manual'` になる）／問題C（`post-photos` バケット名の直書き）
- [02-issues-d-f-schema-check-columns-types.md](REQ-314-single-source-definitions-and-dead-code/02-issues-d-f-schema-check-columns-types.md) — 問題D（`schema:check` の保証範囲が2列のみ）／問題E（select 列リストの重複）／問題F（`PostExtendedFields` が生成型と重複）
- [03-issues-g-i-dead-code-context-photos.md](REQ-314-single-source-definitions-and-dead-code/03-issues-g-i-dead-code-context-photos.md) — 問題G（デッドコードと「定数があるのに効いていない」罠）／問題H（Context のサイレントフォールバック）／問題I（写真表示が Supabase 変換を通らず `next.config.ts` が未使用・2択の判断が必要）
- [04-functional-requirements.md](REQ-314-single-source-definitions-and-dead-code/04-functional-requirements.md) — 機能要件 FR-314-01〜13（群1 機械照合の拡張／群2 述語・定数・列リストの単一化／群3 型の生成型導出／群4 デッドコードの削除または復活）
- [05-acceptance-order-and-scope.md](REQ-314-single-source-definitions-and-dead-code/05-acceptance-order-and-scope.md) — 受入基準 AC-01〜15、実施順序の推奨、対象外（REQ-297 / 299 / 308 / 309 / 310 / 282 / 302 / 307 との線引き）

### 押さえておく前提

- 挙動が変わるのは **FR-314-04 の境界値**（`latMin` ちょうどで GPS 自動入力が働く）と **FR-314-08 の `location_source` 記録値**の2点だけ（AC-14）。他はすべて内部整理。
- 着手順に依存がある。群1（`schema:check` 拡張）は **REQ-297 の後**、FR-314-13（写真経路）は **REQ-308 の方針確定後**。
