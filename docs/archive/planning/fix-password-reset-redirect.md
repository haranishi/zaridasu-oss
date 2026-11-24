> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# パスワードリセットリンクのリダイレクト不具合 修正要件定義

## 📅 作成日: 2026-03-11

---

## これは何か

パスワードリセットのメールリンクを踏んでもパスワード設定画面に行けない不具合について、原因分析と修正方針をまとめた当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

本番（`https://zaridasu.vercel.app`）でリセットメールは届くのに、リンクを踏むとログインページ（ホーム画面）に飛ばされてパスワードを変更できなかった。パスワードを忘れた全ユーザーがログイン不能になる致命的な不具合として重要度「高」で扱われた。

## 主要な決定事項（要点）

- 原因は2つ。①`@supabase/supabase-js` v2.38+ が既定で **PKCEフロー**になり、コールバックURLが `?code=xxxxx` だけで `type=recovery` を含まなくなった。②`AuthCallbackPage` が `lazy()` + `Suspense` で遅延読み込みされるため、リスナー登録前に `PASSWORD_RECOVERY` イベントが発火して**取り逃していた**。
- 修正1: メール送信時の `redirectTo` に `?type=recovery` を明示的に付ける。PKCEフローはクエリパラメータを保持するので、コールバック時にURLへ残る。
- 修正2: `AuthCallbackPage` 側で `INITIAL_SESSION`（セッションあり）を処理し、レースコンディションに依存しない検知に変える。
- 触るのは `AuthModal.jsx` と `AuthCallbackPage.jsx` の2ファイルのみ。**メールテンプレートの変更は不要**（`{{ .ConfirmationURL }}` は Supabase 側で動的生成）。
- 残る確認事項は Supabase Dashboard の Redirect URLs に `/auth/callback` が許可されているか（リスク中）。

## 部品

- [01-defect-overview.md](fix-password-reset-redirect/01-defect-overview.md) — 1. 不具合概要（現象・影響範囲・重要度）。
- [02-root-cause.md](fix-password-reset-redirect/02-root-cause.md) — 2. 根本原因分析（PKCEで `type=recovery` が消える／イベントのレースコンディション／不具合時のフローチャート）。
- [03-fix-plan-and-flow.md](fix-password-reset-redirect/03-fix-plan-and-flow.md) — 3. 修正方針（修正1・修正2）と 4. 修正後のフロー。
- [04-changed-files-and-tests.md](fix-password-reset-redirect/04-changed-files-and-tests.md) — 5. 変更対象ファイルと 6. テスト観点（手動テスト・エッジケース）。
- [05-risks.md](fix-password-reset-redirect/05-risks.md) — 7. リスク評価（既存認証フローへの影響・Redirect URLs 設定・メールテンプレート）。
