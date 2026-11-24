# REQ-286: リポジトリと本番の乖離解消（本番適用済み migration の未コミット・索引の陳腐化・乖離検知の欠如）

作成日: 2026-07-29
状態: **実装済み（2026-07-29）**

優先度: **P1**（FR-286-01〜03 は即時実施可） ／ 深刻度: **Medium** ／ 種別: 構成管理・DevOps
関連: REQ-003（schema sync）, REQ-060（schema.sql smoke check）, REQ-281（CI・運用強化 / FR-281-01 順次適用検証）, REQ-282（プロジェクト整理 / C-1〜C-4・migration 索引の新設）, REQ-285（Edge Function デプロイ整合性）

> [!done] 実施済み（2026-07-29）
> - **FR-286-01**: 未追跡だった migration 1 本と REQ 文書 7 本をコミット。
> - **FR-286-02 / 03**: `supabase/migrations/README.md` を 58→59 本に是正し、`20260728000001` を索引へ追加。schema.sql 同期不要の判定理由も明記。
> - **FR-286-04 / 05**: `scripts/check-migration-drift.sh` を新設し CI へ組み込み。**実際に「README 58 vs 実体 59」を検知して exit 1 することを確認**、是正後に緑になることも確認済み。
> - **FR-286-06**: 運用ルールを追記。
> - 実測: git 管理下 59 本 = 本番 `schema_migrations` 59 本で一致。

---

## これは何か

本番 DB に適用済みの migration が git にコミットされていなかった件を起点に、**乖離の解消・migration 索引の是正・乖離を機械的に検知する仕組みの導入**を扱う要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

2026-07-28 のデータクリーニング中に旧トリガー `analyze-image-on-insert`（ダッシュボード由来・service_role JWT がリテラル埋め込み）を発見し、削除 migration を `supabase db push` で**本番に先に適用**したまま未コミットで終わっていた。結果、git 管理下 58 本に対し本番は 59 本適用済みで、clone したリポジトリから本番を再現できない。加えて REQ-282 で新設した索引 `supabase/migrations/README.md` も実体とずれ、索引としての信頼性を失っていた。根本問題は**この種の乖離を検知する仕組みが無いこと**である。

## 主要な決定事項の要点

- **未追跡ファイルは develop 経由で取り込み、migration と REQ 文書はコミットを分ける**（migration は CI の検証対象のためレビュー単位を分離）。ブランチを切る前に `git rev-list --left-right --count main...origin/main` が `0 0` であることを確認する。
- **乖離検知は 2 方向で重みを変える**。本番にあってリポジトリに無い＝**error**（再現不能）、リポジトリにあって本番に無い＝**warning**（デプロイ待ちの正常状態もありうる）。
- **secrets 未設定なら skip（exit 0）** とし、main への push のみ error、PR は warning（`check-edge-deploy-lag.sh` の MODE 方式を踏襲）。
- **`private` スキーマが schema.sql に無いのは設計どおりで欠陥ではない**（CI の rls-tests は vault/pg_cron/pg_net を持たないため）。ただしその帰結として「トリガーが参照する Edge Function の実在」を CI が検証できない点は制約として扱う。
- **schema.sql 同期の要否は「不要だった」場合も必ず記録する**ことをルール化する。
- **FR-286-01 は P0**。数分で終わり、これをやらない限り他の検証が全て前提を欠く。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-summary-and-background.md](REQ-286-repo-production-drift/01-summary-and-background.md) | §0 要件サマリーと §1 背景（なぜ起きたか／なぜ問題か） |
| [02-current-problems.md](REQ-286-repo-production-drift/02-current-problems.md) | §2 現状の問題 A〜E（実測本数、索引の陳腐化、schema.sql 不要の根拠、private スキーマ方針、検知の欠如） |
| [03-goals-and-scope.md](REQ-286-repo-production-drift/03-goals-and-scope.md) | §3 目的（4点）と §4 スコープ外（REQ-281 との切り分けを含む） |
| [04-requirements.md](REQ-286-repo-production-drift/04-requirements.md) | §5.1 機能要件 FR-286-01〜06（コミット・索引是正・同期記録・乖離検知・陳腐化検知・運用ルール）と §5.2 非機能要件 |
| [05-acceptance-and-open-questions.md](REQ-286-repo-production-drift/05-acceptance-and-open-questions.md) | §6 受入条件 AC-01〜07 と §7 未確定事項3件（実装手段・ジョブ構成・索引検証の粒度） |
| [06-impact.md](REQ-286-repo-production-drift/06-impact.md) | §8 影響範囲（新規スクリプト・変更ファイル・git 履歴・REQ-285 / REQ-281 との関係） |
| [07-priority.md](REQ-286-repo-production-drift/07-priority.md) | §9 優先度。先送りしない理由と、要件ごとの個別優先度（FR-286-01 は P0） |
