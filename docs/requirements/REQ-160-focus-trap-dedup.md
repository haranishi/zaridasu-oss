# REQ-160: フォーカストラップ / Escape ハンドラの重複実装

## 背景
モーダルダイアログのフォーカストラップ（Tab キーでフォーカスをダイアログ内に閉じ込める処理）と Escape キーで閉じる処理を共通化するため、共有フックが既に存在する:
- `src/hooks/useFocusTrap.ts` — `useFocusTrap(ref, active=true)`。ダイアログ内の focusable 要素を取得し、初期フォーカス設定と Tab ループを行う（11〜39行）。
- `src/hooks/useEscapeKey.ts` — `useEscapeKey(onClose)`。document に keydown リスナを張り Escape で `onClose` を呼ぶ（3〜11行）。

しかし、一部のモーダルがこれらのフックを使わず、同等のロジックを各コンポーネント内に直接 `useEffect` でインライン実装しており、コードが重複している。重複により、将来フォーカストラップの不具合修正や改善（例: focusable セレクタの更新、`active` 制御）を行う際に修正漏れが発生するリスクがある。

## 現状の問題
### 共有フックを使っているモーダル（あるべき姿）
- `PostForm.tsx`: `useEscapeKey(onClose)`（66行）+ `useFocusTrap(modalRef)`（68行）を使用。
- `DeleteDialog.tsx`: `useFocusTrap(dialogRef)`（35行）を使用。ただし Escape は `useEscapeKey` を使わず独自 `useEffect`（27〜33行）で実装。
- `EditDialog.tsx`: `useFocusTrap(dialogRef)`（54行）を使用。ただし Escape は `useEscapeKey` を使わず独自 `useEffect`（97〜103行）で実装。

### フォーカストラップを独自実装しているモーダル（要統一）
- **`AuthModal.tsx`（46〜69行）**: `useFocusTrap` を import せず、`useEffect` 内で `dialogRef` から focusable を取得し（50〜52行）、初期フォーカス（56行）と Tab ループ（58〜65行）を `useFocusTrap.ts` とほぼ同一のコードで実装している。依存配列は `[tab]`。Escape は `useEscapeKey` ではなくルート `<div>` の `onKeyDown`（249行）で処理。
- **`ReportModal.tsx`（31〜55行）**: 同様に `useFocusTrap` / `useEscapeKey` を import せず、`useEffect` 内で focusable 取得（36〜38行）・初期フォーカス（42行）・Tab ループ（44〜51行）を独自実装。依存配列は `[done]`。Escape はルート `<div>` の `onKeyDown`（87行）で処理。

`AuthModal` と `ReportModal` のインライン実装は、`FOCUSABLE_SELECTOR` の内容を含め `useFocusTrap.ts` と実質同一であり、明確な重複である。なお両者は依存配列（`AuthModal` は `[tab]`、`ReportModal` は `[done]`）で内部 UI 状態が変わるとトラップを張り直している点に注意が必要。

また、Escape の閉じる処理が、共有フック（`useEscapeKey`、document リスナ）と各コンポーネントのルート `<div>` の `onKeyDown`（AuthModal:249 / ReportModal:87 / PostForm:193）とで実装方式が混在している。

## 目的
全モーダルのフォーカストラップと Escape ハンドラを共有フック（`useFocusTrap` / `useEscapeKey`）に統一し、重複コードを排除する。挙動の一貫性を確保し、今後のアクセシビリティ改善を一箇所で行えるようにする。

## 要件
### 機能要件
- [ ] FR-160-01: `AuthModal.tsx` のインラインフォーカストラップ（46〜69行）を削除し、`useFocusTrap(dialogRef)` の呼び出しに置き換える。
- [ ] FR-160-02: `ReportModal.tsx` のインラインフォーカストラップ（31〜55行）を削除し、`useFocusTrap(dialogRef)` の呼び出しに置き換える。
- [ ] FR-160-03: `AuthModal` / `ReportModal` の Escape 処理を `useEscapeKey(onClose)` に統一し、ルート `<div>` の `onKeyDown` による Escape 処理との二重定義を解消する（重複させない）。
- [ ] FR-160-04: `DeleteDialog.tsx`（27〜33行）と `EditDialog.tsx`（97〜103行）の独自 Escape `useEffect` も `useEscapeKey(onCancel)` に統一する。
- [ ] FR-160-05: 内部 UI 状態でトラップ再設定が必要なケース（`AuthModal` のタブ切替、`ReportModal` の完了表示切替）について、`useFocusTrap` 側で再設定がトリガされること（必要なら `useFocusTrap` の依存・引数設計を見直す）を確認・対応する。

### 非機能要件（該当する場合）
- [ ] NFR-160-01: 統一後、フォーカストラップ / Escape のロジック定義は `useFocusTrap.ts` / `useEscapeKey.ts` の 2 ファイルに集約され、各モーダル内の重複ロジックが残らない。
- [ ] NFR-160-02: 既存のフォーカス挙動（モーダル open 時に先頭要素へフォーカス、Tab で内部ループ、Escape で閉じる）に回帰がないこと。

## 受入条件
- [ ] AC-01: `AuthModal` / `ReportModal` 内に focusable 取得・Tab ループの `useEffect` 直書きが存在しない。
- [ ] AC-02: 全モーダル（AuthModal / ReportModal / EditDialog / DeleteDialog / PostForm）で、開いた直後に内部要素へフォーカスが当たり、Tab / Shift+Tab がダイアログ内でループする。
- [ ] AC-03: 全モーダルで Escape キーにより閉じる動作が維持される（`useEscapeKey` 経由）。
- [ ] AC-04: `AuthModal` のタブ切替後、`ReportModal` の送信完了表示後も、フォーカストラップが正しく機能する。
- [ ] AC-05: 既存のモーダル関連テスト（`src/components/modals/__tests__/`）が全て成功する。

## 影響範囲
- `src/components/modals/AuthModal.tsx`（46〜69行、249行）
- `src/components/modals/ReportModal.tsx`（31〜55行、87行）
- `src/components/modals/EditDialog.tsx`（97〜103行）
- `src/components/modals/DeleteDialog.tsx`（27〜33行）
- `src/hooks/useFocusTrap.ts`（再設定トリガの設計見直しが必要な場合）
- `src/hooks/useEscapeKey.ts`
- 関連テスト: `src/components/modals/__tests__/`

## 優先度
- **緊急度**: 低 / **重要度**: 中 / **理由**: 機能的には現状でも動作しているため緊急ではないが、フォーカストラップという重要なアクセシビリティ機構が 3 通りの実装に分散しており、保守性・将来の改善容易性の観点で統一価値が高い。リファクタリングのため回帰テストで担保する。
