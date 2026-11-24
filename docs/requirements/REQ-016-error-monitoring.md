# REQ-016: エラーモニタリング基盤の導入（Sentry 統合）

## 背景
プロダクション環境で発生するエラーは、ユーザーが報告しない限り開発チームに通知されない。障害の早期検知・影響範囲の把握・再現情報の収集のために、外部エラーモニタリングサービスの導入が必要。

## 現状の問題
- `src/utils/errorHandler.ts`（58-67行目）の `logError()` 関数が本番環境のエラーログを `console.error` に出力するのみ:
  ```typescript
  export function logError(err: unknown, context = ''): void {
    const prefix = context ? `[${context}]` : '[Error]'
    if (process.env.NODE_ENV === 'development') {
      console.error(prefix, err)
    } else {
      // 本番: 最小限のログ（将来 Sentry 等に置き換え）
      const message = err instanceof Error ? err.message : String(err)
      console.error(prefix, message)
    }
  }
  ```
- コメントに「将来 Sentry 等に置き換え」と記載されており（63行目）、Sentry 統合が元々計画されていたことが分かる
- `logError()` は以下の箇所を含む多数の場所で使用されており、エラーログの集約ポイントは既に確立されている:
  - `src/views/DetailPage.tsx`（67行目）
  - `src/views/admin/AdminReportsPage.tsx`（140行目）
  - `src/views/admin/AdminUsersPage.tsx`（208行目）
  - `src/components/modals/ReportModal.tsx`（72行目）
  - `src/hooks/useAdminStats.ts`（162行目）
  - `src/hooks/useCsvExport.ts`（83行目）
  - `src/hooks/useDeletePost.ts` 等
  - `src/lib/auditLog.ts`（25行目）
- `src/app/error.tsx` がグローバルエラーバウンダリとして存在するが、エラーを外部に送信する処理はない
- 本番環境でのエラーは `console.error` のみで、以下が不可能:
  - エラー発生のリアルタイム通知（Slack / メール）
  - エラーの集約・重複排除・トレンド分析
  - ユーザー環境情報（ブラウザ、OS、画面サイズ等）の自動収集
  - エラー発生時のパンくずリスト（ユーザー操作履歴）の記録

## 目的
Sentry（または同等のエラーモニタリングサービス）を導入し、本番環境のエラーをリアルタイムに検知・分類・通知できる基盤を構築する。

## 要件

### 機能要件
- [ ] FR-016-01: Sentry SDK（`@sentry/nextjs`）をインストールし、Next.js プロジェクトに統合する
- [ ] FR-016-02: `src/utils/errorHandler.ts` の `logError()` 関数の本番ブランチを `Sentry.captureException()` に置き換える
- [ ] FR-016-03: `src/app/error.tsx`（グローバルエラーバウンダリ）で `Sentry.captureException(error)` を呼び出す
- [ ] FR-016-04: エラーに `context` パラメータをタグとして付与し、Sentry ダッシュボードでフィルタリング可能にする（例: `DetailPage:fetchPost`, `submitPost` 等）
- [ ] FR-016-05: ユーザー識別情報（認証済みの場合は匿名化されたユーザーID）を Sentry のユーザーコンテキストに設定する
- [ ] FR-016-06: パフォーマンスモニタリング（Sentry Performance）を有効にし、主要ページのロード時間を計測する
- [ ] FR-016-07: Sentry のソースマップアップロードを Vercel ビルド時に自動実行する設定を追加する

### 非機能要件
- [ ] NFR-016-01: Sentry SDK のバンドルサイズ増加を最小限に抑える（lazy loading / tree shaking の活用）
- [ ] NFR-016-02: `SENTRY_DSN` を環境変数として管理し、ソースコードにハードコードしない
- [ ] NFR-016-03: 開発環境（`NODE_ENV=development`）では Sentry にエラーを送信しない（既存の `console.error` を維持）
- [ ] NFR-016-04: GDPR / 個人情報保護の観点から、ユーザーのメールアドレスや個人情報を Sentry に送信しない
- [ ] NFR-016-05: Sentry のサンプルレート設定により、トラフィック量に応じたコスト管理を行う（初期値: errors 100%, transactions 10%）

## 受入条件
- [ ] AC-01: 本番環境で意図的にエラーを発生させた際、Sentry ダッシュボードにエラーが表示される
- [ ] AC-02: エラーイベントに `context` タグ（例: `DetailPage:fetchPost`）が付与されている
- [ ] AC-03: ソースマップが正しくアップロードされ、Sentry 上でスタックトレースが元の TypeScript コードを指している
- [ ] AC-04: 開発環境（`npm run dev`）では Sentry にイベントが送信されない
- [ ] AC-05: `logError()` を呼び出している既存の全箇所で、追加の修正なしに Sentry 送信が機能する（`logError` 内部の変更のみで対応）
- [ ] AC-06: Vercel のデプロイパイプラインでソースマップが自動アップロードされる

## 影響範囲
- `src/utils/errorHandler.ts`（`logError()` 関数の本番ブランチ修正）
- `src/app/error.tsx`（グローバルエラーバウンダリに Sentry 統合）
- `next.config.ts`（Sentry webpack プラグイン設定追加）
- `sentry.client.config.ts`（新規作成: クライアント側 Sentry 初期化）
- `sentry.server.config.ts`（新規作成: サーバー側 Sentry 初期化）
- `sentry.edge.config.ts`（新規作成: Edge ランタイム Sentry 初期化）
- `.env` / `.env.local`（`SENTRY_DSN`, `SENTRY_AUTH_TOKEN` 追加）
- `package.json`（`@sentry/nextjs` 依存追加）
- Vercel 環境変数設定（`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`）

## 優先度
- **緊急度**: High
- **重要度**: Critical
- **理由**: 現状、本番環境のエラーは `console.error` のみで開発チームに一切通知されない。ユーザーがサイレントにエラーに遭遇し離脱するケースを検知できず、障害対応が後手に回る。`logError()` による集約ポイントが既に確立されているため、Sentry 統合の実装コストは比較的低い。プロダクション運用の基盤として最優先で対応すべき。
