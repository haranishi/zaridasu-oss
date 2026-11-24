## 現状の問題

### A. 基盤: viewport-fit 未設定と h-screen（全画面に波及）

- **A-1**: `src/app/layout.tsx` に `export const viewport` が無い。Next.js App Router 既定の `width=device-width, initial-scale=1` は自動注入される（拡大禁止も無く a11y 違反は無い）が、**`viewport-fit=cover` が未設定**。一方で `env(safe-area-inset-*)` を11ファイルが使用し（`globals.css` の `.pb-safe`、`Header.tsx:82`、`BottomNav.tsx:72`、`PostForm.tsx:223`、`SignupBanner.tsx:51`、`MapView.tsx:233` 等）、さらに `layout.tsx:84-85` で `apple-mobile-web-app-capable=yes` + `status-bar-style=black-translucent`（コンテンツがステータスバー下に潜る設定）を指定している。`viewport-fit=cover` が無いと iOS で `env(safe-area-inset-*)` が 0 に評価される環境があり、**セーフエリア対応一式が有効に機能しない**（特にホーム画面追加の PWA 起動時、Header がステータスバーと重なり、BottomNav がホームインジケータと重なるリスク）。
- **A-2**: アプリシェルが `h-screen`（=100vh）。`src/views/HomePage.tsx:243` `flex flex-col h-screen` が本丸で、iOS Safari のアドレスバー分だけ実可視域より高くなり**地図下端・BottomNav 付近が画面外にはみ出す**古典問題。`src/views/DetailPage.tsx:215/230/248`（全画面ローディング/エラー）も同様（中央寄せのため実害小）。モーダル系は `dvh` 対応済み（`PostForm.tsx:222` 等）でシェルだけ未対応の不一致。

### B. モーダルの z-index 衝突（BottomNav がモーダルより手前）

`BottomNav.tsx:67` が `z-[420]` なのに対し、以下のモーダルは `z-50` 止まり: **AuthModal**（`src/components/modals/AuthModal.tsx:392`）・**SurveyRequestForm**（`SurveyRequestForm.tsx:121`）・**EditProfileModal**（`EditProfileModal.tsx:116`）・**退会確認**（`DashboardPage.tsx:58`）。BottomNav 表示ページ（`/`・`/dashboard`・`/profile` 等）でこれらを開くと、**暗幕の上に BottomNav が明るく浮いたまま残り、タップも効く**（モーダル操作中にページ遷移できてしまう）。`PostForm.tsx:219` と `FilterBar.tsx:185` だけ `z-[430]` に直されており「ナビ超えが必須」という意図の証拠。関連して **InstallBanner**（`InstallBanner.tsx:145` `z-40`・bottom オフセット無し）は BottomNav に下部（ボタン付近）を覆われ、iOS ガイドモーダル（`:42` `z-50`）も同様。

### C. モーダルがスマホ画面に収まらない

- **C-1 EditProfileModal**（旧 US-003 AC-4 未解決の本体）: `EditProfileModal.tsx:116/124` — 外枠・内枠とも **max-h も overflow-y-auto も無い**。中身は絵文字12個+ニックネーム+bio+公開/通知チェック6種+Push+保存と縦長で、iPhone SE 級（高さ667px）では**上下が見切れて保存ボタンに到達できない**。同種の AuthModal:395/PostForm:222 は `max-h-[90dvh] overflow-y-auto` 済みでこれだけ漏れ。
- **C-2 ReportModal**: `ReportModal.tsx:92` — ボトムシート形式（`items-end`）なのに max-h / overflow-y-auto / safe-area いずれも無し。landscape で溢れ、ノッチ端末で最下部ボタンがホームインジケータに潜る。
- **C-3 vh→dvh 残り**: `SurveyRequestForm.tsx:124` `max-h-[90vh]`（+safe-area無し）、`EditDialog.tsx:102` `max-h-[90vh]` — iOS アドレスバー分カットされる。
- **C-4 MapModal**: `MapModal.tsx:56-64` — max-h 無し（地図 `h-80` 固定で短い landscape で溢れ）、`onKeyDown` の Esc は div に tabIndex が無く**発火しない**、閉じる×はパディング無し（約18px）。

### D. iOS 自動ズーム（input/textarea/select の 16px 未満）

`src/lib/formStyles.ts:15-33` の共通ヘルパーは `text-base md:text-sm`（モバイル16px）で正しく、PostForm/AuthModal/SurveyRequestForm 等は問題なし。以下が**ヘルパー不使用の 14px 固定**で、iOS Safari がフォーカス時に画面を自動ズームする:
- `ReportModal.tsx:140-147`（通報理由 textarea `text-sm`）
- `EditProfileModal.tsx:106`（`inputCls='...text-sm...'` → ニックネーム/bio に適用）
- `RejectDialog.tsx:63-69`（管理者メッセージ textarea）
- `DashboardPage.tsx:85-91`（退会確認 input）
- `AdminPostsPage.tsx:250,254,258,269`（フィルタ select）・`AdminLogsPage.tsx:181-191`（date input）
