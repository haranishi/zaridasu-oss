# REQ-061: useAdminSessionTimeout の自動テスト

## これは何か

`useAdminSessionTimeout`（REQ-018C：管理画面の 30 分無操作で自動ログアウト）に対する
**unit テストの要件**。現状テストは 0 件で、本体コードには一切変更を加えない。

## 主要な決定事項の要点

- **守りたい不変条件は 3 つ**：INV-01（30 分無操作で `signOut` → `/admin/login`）、
  INV-02（操作でタイマーがリセットされる）、INV-03（unmount で 5 種のリスナーと
  2 本の timeout が全解除され、以後 30 分進めても発火しない）。
- **リグレッションリスクは「静かに壊れる」種類**：cleanup 削除はメモリリーク、
  スロットル条件の反転は**毎秒タイマーリセットで timeout が永久に発火せず管理画面が入りっぱなし**になる。
  どちらも実行時に即座には気付けず、テストが無い現状では CI も通ってしまう。
- **fake timer で `Date` もフェイクする**（`toFake: ['setTimeout', 'clearTimeout', 'Date']`）。
  60 秒スロットルの境界を越えさせるために `Date.now()` の進行が必要。
- **受入条件にネガティブ検証を含める**：cleanup をコメントアウトすると TC-03 が、
  スロットル条件を反転すると TC-02 が、`TIMEOUT_MS` を 1 時間にすると TC-01 が落ちること。
- **カバレッジ目標**：branch 90% / line 95% / function 100%。
- **優先度は Medium**（セキュリティ機能だが手動確認でも代替可能。長期メンテのため自動化する）。

## 目次（各部品）

- [01-background-invariants-and-current-gap.md](REQ-061-test-admin-session-timeout/01-background-invariants-and-current-gap.md)
  — 背景（実装ポイントの file:line、テスト 0 件、リグレッションリスク）、守りたい不変条件 INV-01〜03、現状の検出可否。
- [02-test-environment-and-cases.md](REQ-061-test-admin-session-timeout/02-test-environment-and-cases.md)
  — テスト種別と環境（Vitest / renderHook / fake timers / 各種 `vi.mock` / 配置先）と、テストケース TC-01〜03 の Given/When/Then。
- [03-coverage-fixtures-acceptance-and-scope.md](REQ-061-test-admin-session-timeout/03-coverage-fixtures-acceptance-and-scope.md)
  — カバレッジ目標、テストデータ／フィクスチャ（beforeEach/afterEach と wrapper）、受入条件 AC-01〜03、影響範囲、優先度。
