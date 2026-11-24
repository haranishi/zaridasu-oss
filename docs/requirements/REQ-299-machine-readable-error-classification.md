# REQ-299: エラー分類の機械可読化（DB例外の日本語依存と多言語到達不能の解消）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High**（問題A）〜Medium ／ 種別: コード品質・i18n
状態: **提案 / 未実装**
関連: REQ-273（データ取得失敗の可視化。問題C が本件と同じ生メッセージ露出）, REQ-277（ハードコード日本語の i18n 化）, REQ-211（ログ・監視への PII 混入防止）, REQ-297（静的検査の適用範囲。件数リテラルの機械照合は `schema:check` の拡張が前提）

## これは何か

DB（PostgreSQL トリガー）が投げる業務例外を、クライアントが**日本語の自然言語文面**で識別している
問題と、その日本語が翻訳キーより優先表示されて 4 言語分の翻訳が一度も使われない問題を、
「エラー種別を機械可読キーで表現する」1 本の構造修正で解消する要件。両者は同じ問題の表と裏。

## 主要な決定事項の要点

- **🔴 実施順序を固定する**。FR-299-01（クライアントの判定をキー化）を FR-299-02（DB 文言の変更）より
  **先に**完了させる。逆順にすると `includes('投稿上限')` が静かに false になり、localStorage 上限同期が
  行われないまま「エラーは出るが以後もクライアントチェックを素通りする」退行が起きる（CI では検知されない）。
- **ERRCODE で分類する作法は既にリポジトリ内に前例がある**（`schema.sql:1487` の `USING ERRCODE = '42501'`）。
  レートリミット系だけが文面依存で取り残されている。
- **SQLSTATE は 5 文字制約があるため**、種別名は `DETAIL` / `MESSAGE` のプレフィックスに載せ、
  ERRCODE は分類（レートリミット / 重複 / 状態不整合）レベルに留める設計も可。
  **どちらを採るかは実装時に決め、根拠をコメントに残す**。
- **`resolveErrorMessage` の `raw` 優先分岐は撤廃する**（または非本番限定にする）。本番は必ず翻訳キーを通す。
- **DB 例外メッセージの英語化はしない**。DB は機械可読キー＋開発者向け日本語文面を保持し、
  **利用者向け文言はクライアントの i18n が唯一の正本**とする。
- **件数リテラル「5」は 3 箇所に分散している**（`constants.ts` / `schema.sql` の判定 / メッセージ内）。
  1 箇所から供給し、`schema:check` に一致検査を追加する。
- **migration 側 4 件（`20260425000003` / `20260425000005`）は `schema.sql` に載っていない**ため
  CI の rls-tests / schema-drift では実行されない点に注意する。

## 未決事項

- `USING ERRCODE`（カスタム SQLSTATE）が `supabase-js` のエラーオブジェクトにどう載るか、
  および PostgREST の HTTP ステータス割り当ては**実装の最初に 1 ケースで実測**する。
- `errors.rateLimitServer` を種別ごとに分けるか汎用 1 キーのままにするかは UX 判断で未決。
- REQ-273 FR-273-03（survey 一覧のエラー統一）との実装重複。どちらで実装するかは未決。

## 目次（各部品）

- [01-background-and-problem-a-japanese-substring-match.md](REQ-299-machine-readable-error-classification/01-background-and-problem-a-japanese-substring-match.md)
  — 背景と問題A：`usePostForm.ts` の日本語部分一致、送出元 SQL、文言変更で分岐が静かに死ぬ機序、既存の正しい前例、件数リテラル 3 箇所の表。
- [02-problem-b-unreachable-translations.md](REQ-299-machine-readable-error-classification/02-problem-b-unreachable-translations.md)
  — 問題B：`raw` 優先で `errors.rateLimitServer` が到達不能になる仕組み、4 言語の翻訳所在、`i18n:check` が検知できない理由、`schema.sql` と migration の日本語ハードコード一覧。
- [03-problem-c-d-user-facing-symptoms.md](REQ-299-machine-readable-error-classification/03-problem-c-d-user-facing-symptoms.md)
  — 問題C（en/zh/ko UI に日本語が出る・`err.message` 直表示の 3 フック）と問題D（重複通報が「送信に失敗しました」に化けて再送を誘発する）。
- [04-functional-requirements.md](REQ-299-machine-readable-error-classification/04-functional-requirements.md)
  — 機能要件 FR-299-01〜06（順序固定、DB 側の機械可読化、クライアント変換層、件数リテラルの単一化、通報モーダルの分類、生メッセージ直表示の解消）。
- [05-acceptance-out-of-scope-and-open-checks.md](REQ-299-machine-readable-error-classification/05-acceptance-out-of-scope-and-open-checks.md)
  — 受入基準 AC-01〜08（検証用 grep コマンド付き）、対象外、要確認 3 点。
