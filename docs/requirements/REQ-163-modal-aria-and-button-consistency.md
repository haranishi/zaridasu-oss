# REQ-163: モーダルの aria-labelledby 欠落とボタンスタイルの不統一

## 背景
ザリダスのモーダル群は `role="dialog"` / `aria-modal="true"` を持つが、ダイアログの accessible name を提供する `aria-labelledby`（見出し要素の `id` への参照）の付与状況が一貫していない。一部のモーダルでは見出し `id` と `aria-labelledby` が接続されておらず、スクリーンリーダーがダイアログを開いた際に「何のダイアログか」を読み上げられない。

WCAG 2.1 の以下に関連する:
- **4.1.2 名前・役割・値（レベル A）**: ダイアログ（role="dialog"）に accessible name が必要。
- **1.3.1 情報及び関係性（レベル A）**: 見出しとダイアログの関係をプログラム的に提供すべき。

加えて、モーダル内の主要アクションボタンのスタイルが、グラデーション系とソリッド（単色）系で混在しており、視覚的な一貫性とブランド表現が損なわれている。

## 現状の問題
### aria-labelledby の付与状況（コードで確認）
**対応済み（あるべき姿）:**
- `DeleteDialog.tsx`: ルート `<div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">`（38行）+ `<h3 id="delete-dialog-title">`（40行）。接続済み。
- `EditDialog.tsx`: ルート `<div ... aria-labelledby="edit-dialog-title" aria-describedby="edit-dialog-desc">`（106行）+ `<h3 id="edit-dialog-title">`（108行）+ `<p id="edit-dialog-desc" className="sr-only">`（109行）。接続済み。
- `PostForm.tsx`: ルート `<div ... aria-labelledby="post-form-title">`（190行）+ `<h2 id="post-form-title">`（200行）。接続済み。

**未対応（要修正）:**
- **`ReportModal.tsx`**: ルート `<div role="dialog" aria-modal="true" ...>`（82〜88行）に `aria-labelledby` がない。見出し `<h2 className="...">{t('report.title')}</h2>`（91行）にも `id` がない。→ ダイアログに accessible name がない。
- **`EditDialog.tsx`** は接続済みだが、タスク指摘どおり改めて確認した結果、`EditDialog` は問題なし。**実際に欠落しているのは `ReportModal.tsx`** である。

> 注: タスクで `EditDialog.tsx` も欠落候補として挙げられていたが、実コード（106行・108行）では `aria-labelledby="edit-dialog-title"` と `<h3 id="edit-dialog-title">` が既に接続済みであることを確認した。本要件の `aria-labelledby` 修正対象は `ReportModal.tsx` のみとする。

### ボタンスタイルの不統一（コードで確認）
主要アクション（送信/保存/確定）ボタンの背景スタイルが 2 系統に分かれている:

**グラデーション系（`bg-gradient-to-r`）:**
- `AuthModal.tsx` 送信ボタン（446行）: `bg-gradient-to-r from-red-500 to-rose-600 ... shadow-md shadow-red-500/20 active:scale-[0.98]`。
- `PostForm.tsx` 送信ボタン（456〜458行）: オンライン時 `bg-gradient-to-r from-red-500 to-rose-600 ...`、オフライン時 `bg-gradient-to-r from-amber-500 to-orange-500 ...`。

**ソリッド系（単色 `bg-red-600` 等）:**
- `ReportModal.tsx` 送信ボタン（162行・`LoadingButton`）: `bg-red-600 ... hover:bg-red-700`。キャンセルは枠線ボタン（155行）。
- `EditDialog.tsx` 保存ボタン（232行）: `bg-red-600 ... hover:bg-red-700`。キャンセルは枠線ボタン（224行）。
- `DeleteDialog.tsx` 確定ボタン（52行）: `bg-red-600 ... hover:bg-red-700`。キャンセルは枠線ボタン（49行）。

加えて、角丸も `rounded-xl`（AuthModal/ReportModal/PostForm）と `rounded-lg`（EditDialog/DeleteDialog）で混在している。同種の「主要送信ボタン」が画面ごとに異なる見た目になっている。

## 目的
全モーダルのダイアログに accessible name を確実に付与し（WCAG 4.1.2 / 1.3.1 レベル A）、主要/副次アクションボタンの視覚スタイルを統一規約に基づいて揃える。アクセシビリティと UI 一貫性を同時に改善する。

## 要件
### 機能要件
- [ ] FR-163-01: `ReportModal.tsx` の見出し（91行）に一意な `id`（例: `report-dialog-title`）を付与する。
- [ ] FR-163-02: `ReportModal.tsx` のルート `<div role="dialog">`（82行）に `aria-labelledby="report-dialog-title"` を付与し、見出しと接続する。
- [ ] FR-163-03: 全モーダル（AuthModal / PostForm / EditDialog / DeleteDialog / ReportModal）について `aria-labelledby` が見出し `id` と接続されていることを確認し、未接続があれば是正する。
- [ ] FR-163-04: モーダル内ボタンのスタイル規約を定義する。少なくとも以下を規定する:
  - 主要（primary / 破壊的でない確定）アクション: 一つのスタイル系統（グラデーション または ソリッド）に統一。
  - 破壊的（destructive / 削除）アクション: 専用スタイル。
  - 副次（secondary / キャンセル）アクション: 枠線スタイルに統一。
  - 角丸の統一（`rounded-xl` か `rounded-lg` のいずれか）。
- [ ] FR-163-05: 定義した規約に従い、AuthModal / PostForm / ReportModal / EditDialog / DeleteDialog の主要・副次ボタンのスタイルを統一する（可能なら共通ボタンコンポーネント/ユーティリティへ集約）。

### 非機能要件（該当する場合）
- [ ] NFR-163-01: ボタンスタイルは可能な限り共通コンポーネント（例: `LoadingButton` の拡張）または共有クラスユーティリティに集約し、各モーダルでのクラス直書き重複を減らす（DRY）。
- [ ] NFR-163-02: 統一後のボタンは、フォーカスリング・disabled 状態・コントラスト比（WCAG 1.4.3 AA）を満たす。

## 受入条件
- [ ] AC-01: `ReportModal` をスクリーンリーダーで開いた際、見出し文言（report.title）がダイアログ名として読み上げられる。
- [ ] AC-02: 全 5 モーダルのルート `role="dialog"` 要素が `aria-labelledby` で見出し `id` と接続されている。
- [ ] AC-03: 同一カテゴリのアクションボタン（主要/破壊的/副次）が、全モーダルで一貫した背景スタイル・角丸を持つ。
- [ ] AC-04: 自動アクセシビリティ検査（axe）で、対象モーダルに dialog の accessible name 欠落違反が出ない。
- [ ] AC-05: 既存のモーダル関連テストが全て成功する。

## 影響範囲
- `src/components/modals/ReportModal.tsx`（82行、91行、155行、162行）
- `src/components/modals/AuthModal.tsx`（446行のボタン）
- `src/components/features/posts/PostForm.tsx`（455〜461行のボタン）
- `src/components/modals/EditDialog.tsx`（224行・232行のボタン）
- `src/components/modals/DeleteDialog.tsx`（49行・52行のボタン）
- `src/components/ui/LoadingButton.tsx`（共通ボタン集約先候補）
- 関連テスト: `src/components/modals/__tests__/`

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: `ReportModal` の `aria-labelledby` 欠落は WCAG レベル A の違反でアクセシビリティ上の実害があるため早期是正が望ましい。ボタンスタイル統一は主に一貫性・ブランド品質の問題で機能影響はないが、accessibility 改修と同時に行うと効率的。
