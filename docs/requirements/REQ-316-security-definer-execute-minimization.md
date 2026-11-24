# REQ-316: SECURITY DEFINER 関数の EXECUTE 最小権限化と ALTER DEFAULT PRIVILEGES の根治

作成日: 2026-08-03
優先度: **P0**（群Aの一部）／ **P1**（全体）／ 深刻度: **High〜Critical** ／ 種別: セキュリティ・DB権限
状態: **実装済み（2026-10-21・未適用）**。2026-10-01 に群Aの一部（通知用の内部RPC 7本・`get_ai_cost_summary`・`call_lifecycle_edge_function` の呼び先制限）を対応し、残りは [security-hardening](../../.kiro/specs/security-hardening/requirements.md) の要件1で実装した（migration `20261021120000`、本番へは本人が `supabase db push --linked`）。決定事項は下の `04` 末尾。
関連: REQ-298（本REQを派生させた検査ゲート）, REQ-292（anon GRANT された RPC の認可欠陥・同型）, REQ-241（列挙・認可ハードニング）, REQ-282/REQ-179（列レベル REVOKE の再適用）, REQ-270（webhook secret）

## これは何か

本番で anon から実行できてしまう SECURITY DEFINER 関数 43 本を体系的に最小権限化し、no-op だった `ALTER DEFAULT PRIVILEGES` を根治するための要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

REQ-298 の実装中（2026-08-03）に、`schema.sql:27` の `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` が PostgreSQL 16 で no-op であり、`REVOKE ... FROM anon` は直接付与しか剥がさないため、PUBLIC 経由の実行が 43 本残っていることが実測で判明した。REQ-298 は要件が指定した 4 関数だけを是正しており、本 REQ が残り全部を引き受ける。最も危険なのは `call_lifecycle_edge_function` 系で、anon が Vault の service_role キーと webhook secret を付けて任意の Edge Function を起動できる。

## 主要な決定事項の要点

- 43 本を「本体ゲートの有無」「フロントの `.rpc()` 呼び出し」「想定呼び出し元」で 3 群に分類する。群A（実害寄り・12本）は閉じる、群B（本体ゲートあり・23本）は二層目として閉じる、群C（anon 公開が仕様・8本）は触らない。**群Cの仕分けが最重要**（誤って REVOKE するとアプリが壊れる）。
- `get_ai_cost_summary` は REVOKE では塞がらない認可判定バグ（`= 'admin'` の結果を `IF NOT` で判定）があり、本体を fail-closed に修正する。同型バグを全 SECURITY DEFINER 関数で点検する。
- `ALTER DEFAULT PRIVILEGES` は `IN SCHEMA public` 版をやめ、`FOR ROLE postgres`（`IN SCHEMA` なし）版へ置き換える。これは将来の関数にしか効かないため、既存関数の是正と両輪で行う。
- 検証は pgTAP で行い、REQ-298 と同じく**テスト自身は REVOKE を打たない**方式にして、schema.sql の REVOKE 行が消えたら落ちるようにする。
- P0 は FR-316-01（群A の REVOKE）・FR-316-02（本体修正）・FR-316-03（`call_lifecycle_edge_function` のホワイトリスト）。残りは P1。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-summary-and-background.md](REQ-316-security-definer-execute-minimization/01-summary-and-background.md) | 0. 要件サマリー、背景（発見の経緯と実測、`IN SCHEMA public` 版が効かない理由、`get_ai_cost_summary` の認可判定バグ、`get_audit_logs` の孤児オーバーロード） |
| [02-function-classification.md](REQ-316-security-definer-execute-minimization/02-function-classification.md) | 43本の分類（群A 12本／群B 23本／群C 8本）の一覧と判断根拠 |
| [03-functional-requirements-and-acceptance.md](REQ-316-security-definer-execute-minimization/03-functional-requirements-and-acceptance.md) | 機能要件 FR-316-01〜08 と受入基準 AC-01〜08 |
| [04-open-issues-impact-and-priority.md](REQ-316-security-definer-execute-minimization/04-open-issues-impact-and-priority.md) | 未確定事項5件、本番で採取すべき要確認事項、影響範囲、他要件との関係、優先度の内訳 |
