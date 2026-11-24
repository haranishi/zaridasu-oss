> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# コード品質改善 要件定義

> 作成日: 2026-03-14
> 対象: ザリガニダス (React + Vite + Supabase + TypeScript)
> 分類: コードスメル・技術的負債の解消

---

## 全体サマリー

| # | 課題カテゴリ | 件数 | 優先度 |
|---|------------|------|--------|
| CQ-001 | `console.error` の直接呼び出し残留 | 7箇所 | 🔴 高 |
| CQ-002 | エラーハンドリング不足・空 catch | 7箇所 | 🔴 高 |
| CQ-003 | コンポーネントからの supabase 直接呼び出し | 25+箇所 | 🟠 中 |
| CQ-004 | ハードコード文字列（エラーメッセージ・キーが定数化未済） | 12箇所 | 🟠 中 |
| CQ-005 | alt 属性の不備（アクセシビリティ） | 6箇所 | 🟠 中 |
| CQ-006 | エラーメッセージの i18n 未対応 | 3箇所 | 🟡 低 |
| CQ-007 | 重複コード（Storage操作・日時フォーマット） | 5パターン | 🟡 低 |
| CQ-008 | import パスの一貫性欠如 | 1ファイル | 🟡 低 |
| CQ-009 | ESLint 未設定 | プロジェクト全体 | 🔴 高 |

---

## これは何か

Vite + React 時代のザリダスに残っていたコードスメル・技術的負債を CQ-001〜CQ-009 として棚卸しし、
それぞれの問題・対象箇所・受け入れ条件と、着手順の優先度マトリクスを定義した要件定義書。
各課題の本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 主要な決定事項の要点

- **着手順は ESLint 設定（CQ-009）が最初**。以降の課題を自動検出できる基盤になるため。
  続いて CQ-001 `console.error` の `logError` 一括置換（S・1h）、CQ-002 エラーハンドリング（M・3h）。
- **今週中**：CQ-005 alt 属性（a11y 違反・修正コスト低）、CQ-004 定数化（変更コスト低・効果大）。
- **CQ-003（supabase 直接呼び出しの hooks 抽出）は 3 フェーズに分割**：
  A＝CommentSection・ReportModal（来週・M）、B＝AuthModal・AuthCallback（中期・M）、C＝Admin 系（長期・XL）。
- **中期**：CQ-007 重複コード排除（storage.js 関数拡張）、CQ-006 i18n（方針決定が先）。
- **長期**：CQ-008 import 統一（alias 設定か一括置換）。
- **CQ-001 の背景**：`errorHandler.ts` の `logError()` を使わず直接 `console.error` を呼ぶと本番でもログが出続け、
  将来的な Sentry 等の外部エラー監視への移行が困難になる。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-cq-001-002-logging-and-error-handling.md](requirements-code-quality/01-cq-001-002-logging-and-error-handling.md) | CQ-001 `console.error` の直接呼び出し残留、CQ-002 エラーハンドリング不足・空 catch（問題／対象箇所／受け入れ条件） |
| [02-cq-003-004-supabase-calls-and-constants.md](requirements-code-quality/02-cq-003-004-supabase-calls-and-constants.md) | CQ-003 コンポーネントからの supabase 直接呼び出し、CQ-004 ハードコード文字列の定数化 |
| [03-cq-005-007-alt-i18n-and-duplication.md](requirements-code-quality/03-cq-005-007-alt-i18n-and-duplication.md) | CQ-005 alt 属性の不備、CQ-006 エラーメッセージの i18n 未対応、CQ-007 重複コード |
| [04-cq-008-009-imports-eslint-and-priority.md](requirements-code-quality/04-cq-008-009-imports-eslint-and-priority.md) | CQ-008 import パスの一貫性、CQ-009 ESLint 未設定、実装優先度マトリクス（工数見積もり付き） |
