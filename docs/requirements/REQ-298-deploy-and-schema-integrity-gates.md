# REQ-298: デプロイ・スキーマ整合ゲートの実効化

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: CI・運用
状態: **提案 / 未実装**
関連: REQ-285（Edge Function デプロイ整合性）, REQ-286（リポジトリと本番の乖離）, REQ-281（CI・運用強化）, REQ-287（Supabaseキー移行・ローテーション）, REQ-282（rls-tests の schema.sql 直適用）, REQ-270（webhook secret）, REQ-279（RLS initplan・ログ保持）

> 本文は分割済み。全文は下の各ファイルにある（この入口は目次と要約のみ）。
> 状態の補足: 冒頭の「未実装」は起票時点の記載であり、実際は FR-298-01〜07 / 09 が 2026-08-03 に実装済み（→ [06](REQ-298-deploy-and-schema-integrity-gates/06-implementation-decisions-and-findings.md) / [07](REQ-298-deploy-and-schema-integrity-gates/07-implementation-and-verification.md)）。

## 0. 要件サマリー

REQ-285 / REQ-286 で「リポジトリと本番の乖離を検知する」ガードは**設置された**。しかし現行実装は、実際に起きる乖離パターンのうち次を**原理的に検知できない**。

| 実在する乖離パターン | 現行ガードの反応 |
|---|---|
| `_shared/` のみを変更したコミット（＝全関数のバンドルが古くなる） | **検知しない**（`_shared` を明示除外・CHANGED=0でexit 0） |
| 適用済み migration ファイルを後から書き換えた（内容ドリフト） | **検知しない**（version の集合差分のみ） |
| 乖離が検知されてCIが赤になっても本番デプロイが並行成功 | **ブロックしない**（deploy の `needs` に入っていない） |
| 関数 EXECUTE の REVOKE を誤削除した | **検知しない**（CIが一括GRANTで打ち消し・pgTAP assertion 0件） |
| pg_net webhook ラッパ7本が壊れた | **検知しない**（CIで一度も実行されない・fail-soft で無言） |

加えて CI の PostgreSQL バージョンが宣言（17）と実行（16）で不一致であり、`supabase/config.toml` が参照する `seed.sql` は存在しない。

本要件は「**ガードが存在すること**」から「**ガードが該当故障モードに実際に反応すること**」へ格上げすることを目的とする。

## 主要な決定事項（要点）

- ゲート化の範囲は (a)(b)(c) すべて。決定論的な判定だけを `migration-gate` ジョブへ分離し、`deploy` の `needs` に入れた。
- 関数 EXECUTE の REVOKE は宣言ファイルではなく **`schema.sql` からの導出**で再適用する（人手同期の漏れ自体が本REQの課題だったため）。
- `seed.sql` は置かず `[db.seed] enabled = false` にする。内容ドリフトの除外リストは**0件で運用**する。
- 実測で `20260513000014` の内容ドリフト（本番だけ REQ-208 前の定義）と、`ALTER DEFAULT PRIVILEGES ... FROM PUBLIC` の no-op を発見し、いずれも是正した。
- CI で実発火させるには `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` の secrets 登録が必要（2026-08-03 時点で未登録・保留）。

## 分割ファイル

- [01-background-shared-and-migration-drift.md](REQ-298-deploy-and-schema-integrity-gates/01-background-shared-and-migration-drift.md) — 背景の問題A〜C（`_shared/` 変更の検知漏れ、migration の内容ドリフト、乖離がデプロイをブロックしない）
- [02-background-grants-pgnet-and-config.md](REQ-298-deploy-and-schema-integrity-gates/02-background-grants-pgnet-and-config.md) — 背景の問題D〜G（一括GRANTがREVOKEを打ち消す、pg_netラッパ未実行、PGバージョン不一致、seed.sql不在）
- [03-functional-requirements.md](REQ-298-deploy-and-schema-integrity-gates/03-functional-requirements.md) — 機能要件 FR-298-01〜09
- [04-acceptance-and-open-questions.md](REQ-298-deploy-and-schema-integrity-gates/04-acceptance-and-open-questions.md) — 受入基準 AC-01〜10、未確定事項、要確認
- [05-impact-and-priority.md](REQ-298-deploy-and-schema-integrity-gates/05-impact-and-priority.md) — 影響範囲（コード・他要件）と優先度の内訳
- [06-implementation-decisions-and-findings.md](REQ-298-deploy-and-schema-integrity-gates/06-implementation-decisions-and-findings.md) — 実装記録（2026-08-03）: 着手前の判断、事前実測、実測で見つかった欠陥3件
- [07-implementation-and-verification.md](REQ-298-deploy-and-schema-integrity-gates/07-implementation-and-verification.md) — 実装内容、意図的に壊しての実証、受入基準の状況、運用への影響、secrets 未登録の注意
