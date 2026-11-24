# REQ-282: プロジェクト整理 — リポジトリ衛生・ドキュメント整合・マイグレーション索引・コード精度

優先度: **P1**（ワークストリームA/B-1はP0級） ／ 種別: 保守性・整合性（機能変更なし）
状態: **✅ 実装済み（2026-07-18）** — A/B/C/D 全ワークストリーム完了。C-1で from-scratch 再適用性の課題を実測し REQ-281 へ引き継ぎ。全コミットで type-check / lint / test(631) / i18n:check / build 緑・ユーザー可視挙動の変更なし。

## これは何か

**挙動を変えずに**リポジトリの整合性を回復する整理作業を、4 つのワークストリーム（A〜D）として定義した要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

機能開発と監査（REQ-239〜281）を高速に重ねた結果、「コードの正」と「文書・設定・生成物の正」がずれ始めていた。記述はすべて 2026-07-18 時点の実地調査に基づく（推測なし）。

## 主要な決定事項の要点

- **最重要は B-1 の stale 警告** — `supabase/migrations/README.md` が「`20260616000005` は本番未適用、`posts.reporter_ip`（PII）が anon から読める」と警告し続けていたが、**2026-07-18 の `supabase migration list` で全適用済みと確認**。PII 露出は解消済みで、**READMEだけが「本番が危険」と主張していた**。migration 本数も 51→58 に是正。
- **A: `coverage/` 50 ファイルが git 管理されていた**（`.gitignore` に記載漏れ）。`git rm -r --cached` で追跡から外す。
- **B-2: CI コメントが存在しないファイル（`001_`/`002_`）を根拠にしていた**。schema.sql 直接適用という設計判断の根拠が現存しない状態だったため、現在の事実で書き直す。
- **進捗トラッカーは `docs/requirements/` のインデックス群＋各REQの状態欄を唯一の正**とし、他 3 系統はアーカイブ注記を付けて `docs/archive/` へ移す。
- **アーカイブは移動のみで削除しない**（git 履歴と本文を保全）。各ファイル冒頭に「superseded by REQ-XXX」または「歴史的文書」を 1 行付す。
- **C の方針: ファイルを動かさず、索引・検証・自動化で秩序を回復する**。適用済み migration の統合・改名・squash は `schema_migrations` 台帳と不整合になり `db push` が壊れるため**恒久的に行わない**。
- C-1 は「順序バグが現存するか」を空 DB への辞書順全適用で**実測して確定**し、CI ジョブ化は REQ-281 FR-281-01 へ引き継ぐ。
- rls-tests が手動再適用している 4 本は `supabase/ci/reapply-after-grants.txt` に外出しし、追加漏れをレビューで発見しやすくする。
- **D は挙動変更なしのメンテナンスのみ**（D-1〜D-7 を実施）。**D-8（500行超コンポーネント 8 本）は分割候補のリスト化と方針メモ 1〜3 行に留め、実際の分割は個別REQ**。
- 推奨実施順序は **A（10分・即効）→ B-1/B-2（誤情報の解消）→ D → B-3〜B-6 → C**。
- 受入の全体条件として、**どのコミットもユーザー可視の挙動を変更しない**こと。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-purpose-and-workstream-a.md](REQ-282-project-housekeeping/01-purpose-and-workstream-a.md) | 目的と、ワークストリームA（リポジトリ衛生）の現状の問題 A-1 と機能要件 FR-282-A1〜A2 |
| [02-workstream-b-docs.md](REQ-282-project-housekeeping/02-workstream-b-docs.md) | ワークストリームB（ドキュメント整合）— 問題 B-1〜B-6（stale 警告、CI コメント、進捗トラッカー多重化、旧世代文書 9 本、planning のアーカイブ化、散在ファイル）と FR-282-B1〜B6 |
| [03-workstream-c-migrations.md](REQ-282-project-housekeeping/03-workstream-c-migrations.md) | ワークストリームC（マイグレーション整理）— 現状と前提（58本・二重管理・squash 不可）と FR-282-C1〜C4 |
| [04-workstream-d-code.md](REQ-282-project-housekeeping/04-workstream-d-code.md) | ワークストリームD（コード精度）— Low 項目 D-1〜D-8 の一覧表と FR-282-D1〜D2 |
| [05-acceptance-order-and-scope.md](REQ-282-project-housekeeping/05-acceptance-order-and-scope.md) | 受入基準 AC-01〜06、実施順序の推奨、対象外（他REQとの線引き） |
