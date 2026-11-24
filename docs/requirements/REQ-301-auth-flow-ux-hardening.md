# REQ-301: 認証フローのUX堅牢化（生エラー露出・セッション解決待ち・CAPTCHA消費）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High**（問題A）〜Low ／ 種別: UX・セキュリティ
状態: **提案 / 未実装**
関連: REQ-212（公開エンドポイントのbot対策・Turnstile）, REQ-273（データ取得失敗の可視化）, REQ-277（i18n 日本語ハードコード）, REQ-183（共有UIエラーのi18n）, REQ-223（フォームUX / FR-223-08 二重送信ガード）, REQ-152（パスワード強度）, REQ-182（LP signup アトリビューション）

## 背景

認証はプロダクトの入口であり、**投稿はログイン必須**である。ここで失敗の理由が伝わらなければ、ユーザーは投稿に到達する前に離脱する。

**エラー文言を正しく扱う仕組みは既にある。`AuthModal` だけがそれを使っていない。**

| 仕組み | 既にある実装 | `AuthModal` の現状 |
|---|---|---|
| エラーの i18n 変換 | `src/lib/errorHandler.ts` の `getErrorMessage()`、`errors.network`（ja:「通信エラーが発生しました。インターネット接続を確認してください。」）/ `errors.tooManyRequests` が4言語に存在 | `getErrorMessage` を使わず、独自の `AUTH_ERROR_MAP`（:78-83）4パターンのみ。マップ外は生メッセージを表示（問題A） |
| オフライン検知 | `useOnlineStatus`（`useSyncExternalStore` ベース。REQ-197 で `PostForm` に適用済み） | 未使用。オフラインでも送信して "Failed to fetch" を出す（問題A） |
| セッション解決待ち | 同ファイル内の LP CTA effect（`HomePage.tsx:174`）が `if (!pendingAuthTab || authLoading) return` と**明示的に `authLoading` を待つ** | 主要 CTA（`handlePostClick` :209-214 / `onSurveyClick` :248-256）は `authLoading` を見ない（問題B） |
| 表示文言の固定化 | 他画面のエラー表示は `t()` 経由の固定文（REQ-183） | `AuthCallbackPage.tsx:58` は URL 由来の任意文字列をそのまま表示（問題D） |
| 二重送信の同期ガード | REQ-223 FR-223-08 に従い `AuthModal.tsx:258` / `SurveyRequestForm.tsx:78` / `PostForm` が冒頭 `if (loading) return` | `EditProfileModal` / `ReportModal` は `disabled` 頼み（問題E） |

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と背景のみ）。

- [01-background-issues.md](REQ-301-auth-flow-ux-hardening/01-background-issues.md) — 問題A〜E（認証エラーの生英語メッセージ露出／`authLoading` を待たずログイン済みに新規登録モーダル／クライアント側バリデーションで CAPTCHA トークンを焼く／認証コールバックで URL 由来の任意文字列を表示／二重送信の同期ガード適用漏れ）
- [02-requirements-acceptance-and-notes.md](REQ-301-auth-flow-ux-hardening/02-requirements-acceptance-and-notes.md) — 機能要件 FR-301-01〜、受入基準、備考（要確認）

### 実装時に外せない注意

- `AUTH_ERROR_MAP` を残す場合でも、**REQ-018D の「`already registered` を汎用文言に丸めてメール列挙を防ぐ」方針を壊さない**。汎用化はセキュリティ要件であり、親切な文言に置き換えてはならない。
- `error_code` ホワイトリストの実値は Supabase Auth 実装依存で要確認。既存で分岐している `otp_expired` は必ず含める（未知コードは固定文へ落とすので不完全でも安全側）。
- `resetCaptcha()` の条件化は「Turnstile トークンは単回使用」と両立させる。**送信した場合は必ずリセット**し、送信していない場合のみ維持する。
