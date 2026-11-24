## 受入条件

- [ ] AC-01: 幅375px（iPhone SE 相当）で主要全ルート（`/`, `/lp`, `/dashboard`, `/collection`, `/requests`, `/request/[id]`, `/ranking`, `/trends`, `/about`, `/species/american`, `/area/秋田市`, `/dataset`, `/post/[id]`, `/admin` 配下全ページ）に横スクロールが発生しない（`document.documentElement.scrollWidth <= 375`）。
- [ ] AC-02: BottomNav 表示ページで AuthModal / EditProfileModal / SurveyRequestForm / 退会確認を開いたとき、BottomNav が暗幕の下に沈み、タップしてもページ遷移しない。
- [ ] AC-03: iOS Safari（実機またはシミュレータ）で全フォーム入力（通報・プロフィール編集・退会・admin フィルタ含む）のフォーカス時に自動ズームが発生しない（computed font-size ≥ 16px）。
- [ ] AC-04: 高さ667px（iPhone SE）でプロフィール編集モーダルの保存ボタンまで内部スクロールで到達し保存できる。ReportModal / SurveyRequestForm も landscape（高さ~375px）で全ボタンに到達できる。
- [ ] AC-05: E 節の対象要素すべてでタップ当たり判定が 44×44px 以上（DevTools の getBoundingClientRect または疑似要素込みのヒットテストで計測）。
- [ ] AC-06: ホーム画面追加（PWA スタンドアロン）起動時、Header がステータスバーに、BottomNav がホームインジケータに重ならない（`env(safe-area-inset-*)` が非0で効く）。
- [ ] AC-07: iOS Safari のアドレスバー表示状態で、ホームの地図下端と BottomNav 全体が可視域内に収まる（dvh 化の確認）。
- [ ] AC-08: /dataset の API 例が枠内で折り返され、ページ全体の横スクロールが無い。
- [ ] AC-09: タッチ環境（hover 無し）で /trends・/dashboard の棒グラフの各月件数が読める。
- [ ] AC-10: モーダル表示中に背景ページがスクロールしない（オーバーレイ上のスワイプで背後が動かない）。
- [ ] AC-11: `npm test`（627）・`npm run e2e`（33）・`npm run build`・`npm run size`・CI 全ジョブ（perf-budget 含む）が green のまま。
- [ ] AC-12: ピンチズームによる拡大が全ページで可能なまま（NFR-268-03）。
