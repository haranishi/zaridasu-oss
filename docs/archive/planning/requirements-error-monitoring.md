> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: INFRA-001 エラー監視（Sentry 統合）

- **ID**: INFRA-001
- **優先度**: 🔴 高（本番運用の信頼性に直結）
- **使用サービス**: Sentry（無料プラン: 5K errors/月）
- **作成日**: 2026-03-20

---

## これは何か

Sentry を入れて本番のエラーを可視化する構想を 2026-03-20 に検討した当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

当時の `logError()` は `import.meta.env.DEV` のときだけ `console.error` を出す実装で、**本番では何も記録されなかった**。`ErrorBoundary` もレンダリングエラーを捕捉するだけで外部に送信しておらず、非同期エラーの発生頻度もユーザー報告時の再現手がかりも得られない状態だった。この穴を Sentry で埋めるのがこの文書の狙い。

## 主要な決定事項（要点）

- SDK は `main.jsx` で `Sentry.init()`。DSN は環境変数 `VITE_SENTRY_DSN` で渡し、**開発環境では送信しない**（`enabled: import.meta.env.PROD`）。
- 既存 `logError()` の中で PROD のときだけ `Sentry.captureException()` を呼ぶ設計にし、**呼び出し側は一切変更しない**。
- `ErrorBoundary` の `componentDidCatch` から送信し、`componentStack` をコンテキストに付ける。
- プライバシーのため紐付けるのは `user.id` のみで、**メールアドレスは送信しない**。
- Source Map は生成するが本番配信では公開しない（`sourcemap: 'hidden'`）。アップロードは `@sentry/vite-plugin` に任せる。
- コストは無料の Developer プラン（5,000 errors/月）内に収め、トレースは `tracesSampleRate: 0.1` に抑える。

## 部品

- [01-issues-and-user-stories.md](requirements-error-monitoring/01-issues-and-user-stories.md) — 当時の課題4点と、開発者・運用者・管理者のユーザーストーリー。
- [02-functional-requirements.md](requirements-error-monitoring/02-functional-requirements.md) — F1 SDK初期化 〜 F6 Source Map アップロード（`logError()` の実装コード込み）。
- [03-nonfunctional-and-implementation.md](requirements-error-monitoring/03-nonfunctional-and-implementation.md) — 非機能要件（コスト・バンドル影響・PII・保持期間・アラート）と、新規/変更ファイル一覧。
- [04-prep-and-test-perspectives.md](requirements-error-monitoring/04-prep-and-test-perspectives.md) — 実装前の準備作業（アカウント作成・DSN・Auth Token・アラートルール）とテスト観点7点。
- [05-error-flow.md](requirements-error-monitoring/05-error-flow.md) — エラー発生から開発者への通知までのフロー図。
