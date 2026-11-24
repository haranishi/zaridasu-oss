## 目的

1. 主利用シーン（スマホ・野外・片手操作）で「操作できない/読めない/隠れる/はみ出す」を全廃する。
2. iOS 固有問題（safe-area 無効・100vh・自動ズーム・ラバーバンド）を仕組みで塞ぐ。
3. 旧 responsive-mobile.md の未解決項目を清算し、本書を現行の単一のレスポンシブ基準とする。

## 要件

### 機能要件（P1: スマホで機能が壊れている/操作不能）

- [ ] FR-268-01: `src/app/layout.tsx` に `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#dc2626' }` を追加する（拡大禁止系 `maximumScale`/`userScalable` は**設定しない**）。既存の `<meta name="theme-color">` 手書きがあれば viewport export に一本化。
- [ ] FR-268-02: アプリシェルの `h-screen` を dvh 化する。`HomePage.tsx:243` を `h-dvh`（Tailwind 3.4+。未対応なら `h-screen supports-[height:100dvh]:h-[100dvh]` 等のフォールバック付き）へ。`DetailPage.tsx:215/230/248` も同様。
- [ ] FR-268-03: モーダル/オーバーレイの z-index を BottomNav（`z-[420]`）超に統一する。対象: `AuthModal.tsx:392`・`SurveyRequestForm.tsx:121`・`EditProfileModal.tsx:116`・`DashboardPage.tsx:58`（退会）・`InstallBanner.tsx:42`（iOSガイド）→ `z-[430]`。`InstallBanner.tsx:145` のバナー本体は `SignupBanner.tsx:51` と同じ `bottom: calc(4rem + env(safe-area-inset-bottom))` 方式で BottomNav を回避（z変更でなく位置回避。ナビ操作は塞がない）。定数化（例 `Z_INDEX.modal`）または `docs/project-structure-conventions.md` に「モーダルは z-[430]」を明文化し再発防止。
- [ ] FR-268-04: モーダルの画面収まりを統一する。(a) `EditProfileModal.tsx:124` に `max-h-[90dvh] overflow-y-auto` を追加。(b) `ReportModal.tsx:92` に `max-h-[90dvh] overflow-y-auto` + `paddingBottom: env(safe-area-inset-bottom)`。(c) `SurveyRequestForm.tsx:124`・`EditDialog.tsx:102` の `90vh` → `90dvh`（SurveyRequestForm は safe-area padding も追加）。(d) `MapModal.tsx:56-64` に `max-h-[90dvh]`、Esc は `useEscapeKey` 共通フックへ置換、閉じる×に `p-2` 以上。
- [ ] FR-268-05: iOS 自動ズーム対策。D 節の14px固定入力6箇所をすべて `text-base md:text-sm`（または `formStyles.ts` の共通ヘルパー）へ変更する: ReportModal textarea / EditProfileModal inputCls / RejectDialog textarea / DashboardPage 退会 input / AdminPostsPage select 4箇所 / AdminLogsPage date input 2箇所。
