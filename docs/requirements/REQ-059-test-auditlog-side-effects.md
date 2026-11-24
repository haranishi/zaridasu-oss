# REQ-059: writeAuditLog 副作用の厳密検証

## これは何か

管理画面の承認/却下/削除/権限付与が `audit_logs` へ残す監査ログについて、**呼び出しの有無だけでなく引数の中身まで検証する**テストを整備する要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

現状の `AdminPostsPage.test.tsx` は `writeAuditLog` を `vi.fn()` でモックしているだけで **call args を検証していない**。そのため `action` 文字列の取り違え、`details` を空オブジェクトで渡す、`targetId` の取り違え、`rejection_reason` の入れ忘れといったリグレッションが CI をすり抜ける。実際、`details: {}` に書き換えても現行テストは通ってしまう。

`writeAuditLog` の呼び出し元は4画面10箇所（`AdminPostsPage` 6・`AdminCommentsPage` 1・`AdminUsersPage` 1・`AdminReportsPage` 2）あるが、`AdminPostsPage` 以外はテストが 0 件である。

## 主要な決定事項の要点

- **不変条件を4つ立てる。** INV-01 approve_post は `adminId`/`action`/`targetType`/`targetId`/`details` の**完全一致**、INV-02 reject は `details.rejection_reason` を含むこと、INV-03 delete は `targetId` 一致、INV-04 toggle_official は `details.is_official` が**変更後の新値**であること。
- **ネガティブ検証を受入条件に入れる。** `details: {}` に書き換える／`action` を `'approve'` に変える／呼び出し自体を消す、のいずれでもテストが落ちることを確認する。テストが「壊れたら落ちる」ことまで担保する。
- **削除失敗時に監査ログを書かないこと**もテストする（TC-03 の And 節）。
- **Phase 1 は `AdminPostsPage` の4ケース拡張に絞る**（approve / reject / delete / toggle_official＝6箇所中4箇所）。`AdminCommentsPage` / `AdminReportsPage` / `AdminUsersPage` の新規テストは Phase 2 とし、そこで呼び出し箇所 100% を網羅する。
- **既存のモック戦略を踏襲する**（`vi.mock('@/lib/auditLog')` の共通化と `beforeEach` の `mockClear()`）。**本体コードへの変更は無い。**
- **優先度は Medium**。監査ログは法令・運用上必須だが、書き込みは fire-and-forget でユーザー影響がないため P1 ではない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-invariants.md](REQ-059-test-auditlog-side-effects/01-background-and-invariants.md) | 背景（検出できないリグレッション4種と、呼び出し元10箇所の一覧）、守りたい不変条件 INV-01〜04、現状の検出可否 |
| [02-test-environment-and-cases.md](REQ-059-test-auditlog-side-effects/02-test-environment-and-cases.md) | テスト種別・フレームワーク・モック戦略・配置先と、テストケース TC-01〜04（Given/When/Then と期待コード） |
| [03-coverage-acceptance-and-impact.md](REQ-059-test-auditlog-side-effects/03-coverage-acceptance-and-impact.md) | カバレッジ目標、テストデータ/フィクスチャ、受入条件 AC-01〜03（ネガティブ検証を含む）、影響範囲、優先度 |
