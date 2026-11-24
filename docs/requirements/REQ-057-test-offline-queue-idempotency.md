# REQ-057: Offline queue sendOne の冪等性テスト追加

## 背景
`src/hooks/useOfflineQueue.ts:51-115` の `sendOne` は、オフライン保留中の投稿（写真 Blob を含む）を Supabase に 1 件ずつ同期する責務を持つ。失敗時の挙動（status='error'）、成功時の Edge Function 呼び出し、途中失敗時の冪等性（二度挿入しない）が保証されなければならないが、現状このフックには単体テストが 1 件も存在しない。
特に、写真 3 枚アップロード中に 2 枚目が失敗したケースや、1 回目失敗後のリトライで posts テーブルに重複挿入されないかは、ユーザー側の体験（「投稿が 2 件になった」「保留中のまま消えない」等）に直結する。


## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と背景のみ）。

- [01-invariants-and-test-environment.md](REQ-057-test-offline-queue-idempotency/01-invariants-and-test-environment.md) — 守りたい不変条件 INV-01〜04、現状の検出可否（`useOfflineQueue.test.*` が存在しない）、テスト種別と環境（Vitest ＋ `fake-indexeddb` ＋ `renderHook`、モックとセットアップ手順）
- [02-test-cases.md](REQ-057-test-offline-queue-idempotency/02-test-cases.md) — TC-01〜04 の Given/When/Then（2枚目upload失敗で `status='error'`／リトライしても insert は合計1回／成功時に `analyze-image` が1回だけ／insertError 時に error 記録）
- [03-coverage-fixtures-and-acceptance.md](REQ-057-test-offline-queue-idempotency/03-coverage-fixtures-and-acceptance.md) — カバレッジ目標、テストデータ／フィクスチャ（Blob ヘルパと supabase fluent chain のモック雛形）、受入条件 AC-01〜03、影響範囲、優先度

### 要点

- 検証の核は **冪等性**（リトライで `posts` に二重挿入しない）と**失敗時の `status='error'` 記録**。
- 受入条件には**ネガティブ検証**が含まれる（`if (uploadError) throw uploadError` を消すと TC-01 が落ちる、など）。ガードが実際に反応することまで確認する。
- `insertError` 時のアップロード済み `photoUrls` のクリーンアップは**現状未実装**で、本テストは「error に記録される」ことまでを検証範囲とする。
