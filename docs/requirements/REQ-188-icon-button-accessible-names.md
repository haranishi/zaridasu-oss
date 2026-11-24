# REQ-188: アイコンのみボタン/リンクへの accessible name 付与

## 背景
ザリダスではアイコン UI に `lucide-react`（`X` / `ArrowLeft` 等）を使用している。`lucide-react` は描画する `<svg>` に `aria-hidden="true"` を自動付与するため、アイコンだけで構成されたボタン・リンクは、テキストノードを一切持たず accessible name が**完全に空**になる。

スクリーンリーダー利用者には「ボタン」「リンク」とだけ読み上げられ、何のボタンかが判別できない。これは WCAG 2.1 の以下に違反する:
- **4.1.2 名前・役割・値（レベル A）**: 操作可能な UI コンポーネントには accessible name が必要。
- 自動検査（axe）では `button-name` / `link-name` ルールに **critical** で該当する。

正しいパターンは既にコードベースに存在する: `src/components/features/posts/PostForm.tsx:228` の閉じるボタンは `aria-label={t('postForm.close')}` を持つ。本要件はこの既存パターンを、対象漏れしているアイコンボタン/リンクへ横展開する。

i18n キーの実態（確認済み）:
- `common.close` = 「閉じる」、`common.cancel` = 「キャンセル」は **4 ロケール（ja/en/ko/zh）に既存**。
- `postForm.close` / `report.close` も既存。
- `common.back`（戻る）は **4 ロケールすべてに未定義** → 本要件で新設が必要。

## 現状の問題
以下のアイコンのみボタン/リンクに `aria-label` 等の accessible name がない:

- `src/components/modals/AuthModal.tsx:248-253` — 閉じる（`X`）ボタン。`aria-label` なし。**LP の主 CV 導線**（`/?auth=signup&from=lp` で自動オープンされる認証モーダル）の入口であり、影響が大きい。
- `src/components/modals/EditDialog.tsx:164-170` および `177-183` — 写真削除ボタン（`X`）。既存写真の削除（167行付近）・新規プレビューの削除（180行付近）の 2 系統とも `aria-label` なし。
- `src/views/DetailPage.tsx:184-189` — ヘッダーの戻る矢印リンク（`<Link href="/">` 内 `ArrowLeft`）。`aria-label` なし。
- `src/views/SurveyRequestPage.tsx:143-145` — ヘッダーの戻るボタン（`router.back()` の `ArrowLeft`）。`aria-label` なし。
- `src/views/ProfilePage.tsx:197` および `217` — ヘッダーの戻る矢印リンク（`<Link href="/">` 内 `ArrowLeft`）。`not-found` 分岐（197行）と通常表示（217行）の 2 箇所とも `aria-label` なし。
- `src/components/modals/ReportModal.tsx:75` — 閉じるボタンは `aria-label="閉じる"` が**直書き**（ハードコード日本語）。機能としては accessible name はあるが、i18n 化されておらず他言語で日本語のまま読み上げられる。

> 対象外の明記:
> - `src/components/modals/SurveyRequestForm.tsx`（99行）の閉じるボタンも `aria-label` 欠落だが、これは **REQ-189**（SurveyRequestForm の包括的 a11y 改修）で扱うため本要件の対象外とする。
> - `src/components/features/posts/PostForm.tsx:228` は既に `aria-label={t('postForm.close')}` を持つ**正しい既存パターン**であり、修正不要（横展開の参照元）。

## 目的
アイコンのみのボタン/リンクすべてに、操作内容を表す accessible name を付与し（WCAG 4.1.2 レベル A）、4 ロケールで適切に読み上げられるようにする。ハードコード日本語を i18n キーへ置き換える。

## 要件
### 機能要件
- [ ] FR-188-01: `src/components/modals/AuthModal.tsx:248` の閉じるボタンに `aria-label`（`common.close` または `postForm.close` 流用）を付与する。
- [ ] FR-188-02: `src/components/modals/EditDialog.tsx` の写真削除ボタン 2 箇所（164行・177行）に `aria-label`（例: `postForm.removePhoto` 流用、または新設「写真を削除」キー）を付与する。各写真を区別する必要があれば `t('...', { index: i + 1 })` の形を許容する。
- [ ] FR-188-03: `src/views/DetailPage.tsx:184` / `src/views/SurveyRequestPage.tsx:143` / `src/views/ProfilePage.tsx:197,217` の戻る矢印リンク/ボタンに `aria-label`（`common.back`）を付与する。
- [ ] FR-188-04: `src/components/modals/ReportModal.tsx:75` の直書き `aria-label="閉じる"` を `aria-label={t('report.close')}`（または `t('common.close')`）に置き換える。
- [ ] FR-188-05: i18n キーを整備する:
  - `common.back`（「戻る」/ en: "Back" / ko / zh）を 4 ロケールに**新設**する。
  - 必要なら「写真を削除」用キーを 4 ロケールに新設（既存 `postForm.removePhoto` があれば流用）。
  - `common.close` / `report.close` は既存のため流用する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-188-01: 既存の正しいパターン（`PostForm.tsx:228` の `t('postForm.close')`）と整合する形（`aria-label={t(...)}`）で統一し、ハードコード文字列を新たに増やさない。

## 受入条件
- [ ] AC-01: AuthModal / EditDialog（写真削除）/ DetailPage / SurveyRequestPage / ProfilePage / ReportModal の対象アイコンボタン/リンクが、いずれも空でない accessible name を持つ。
- [ ] AC-02: vitest-axe による検証で、対象コンポーネント（または代表スニペット）に `button-name` / `link-name` 違反が 0 件。
- [ ] AC-03: `common.back` を含む新設キーが ja/en/ko/zh の 4 ファイルすべてに存在し、欠損ロケールがない（キー網羅テストが通る）。
- [ ] AC-04: `ReportModal` の閉じるボタンが、言語切替時に各言語の「閉じる」相当として読み上げられる（日本語ハードコードが残らない）。
- [ ] AC-05: 既存のモーダル・ページ関連テストが全て成功する。

## 影響範囲
- `src/components/modals/AuthModal.tsx`（248行）
- `src/components/modals/EditDialog.tsx`（164行・177行）
- `src/views/DetailPage.tsx`（184行）
- `src/views/SurveyRequestPage.tsx`（143行）
- `src/views/ProfilePage.tsx`（197行・217行）
- `src/components/modals/ReportModal.tsx`（75行）
- `src/locales/{ja,en,ko,zh}/translation.json`（`common.back` 等の追加）
- 関連テスト: `src/components/**/__tests__/`（a11y smoke）、i18n キー網羅テスト

## 優先度
- **緊急度**: 高 / **重要度**: 高 / **理由**: WCAG 4.1.2 レベル A・axe critical の明確な違反。特に AuthModal は LP からの主要 CV 導線の入口で、支援技術利用者が閉じる操作を認識できない。修正は `aria-label` 付与＋キー追加と局所的で、リスクが低く効果が高い。
