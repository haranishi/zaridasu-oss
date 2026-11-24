## 機能要件

- **FR-315-01（二重送信ガードの適用）**: `EditProfileModal.handleSave`（`:85`）・`ReportModal.handleSubmit`（`:45`）・`AdminPostsPage.handleBulkDelete` / `handleBulkApprove`（`:93-103`）の冒頭に、REQ-223 FR-223-08 と**同型の同期 return ガード**を追加する（`if (saving) return` / `if (loading) return` / 一括操作の実行中フラグ）。既存の `disabled` は残す（第一防衛と第二防衛の二層。`PostForm.tsx:172-176` のコメントの流儀に合わせて理由を1行残す）。**REQ-295 / REQ-301 / REQ-313 が同じハンドラを先に書き換えた場合は、そちらでガードを入れて本FRの該当分を消化してよい。**
- **FR-315-02（日時ロケールの統一）**: `PendingPostsSection.tsx:132` の `toLocaleString('ja-JP', …)` を、`ProfilePage.tsx:20` / `SpeciesDexCard.tsx:12` が使っている `DATE_LOCALE_TAG` マップ経由に置き換える。**表示書式のオプション（`month`/`day`/`hour`/`minute`）は変えない。** あわせて `toLocaleString` / `toLocaleDateString` の第1引数にロケールタグを直書きしている箇所が他に無いかを機械走査で棚卸しし、あれば同じ扱いにする（REQ-277 Phase1/2 の対象表から漏れた形なので、同じ漏れを残さない）。
- **FR-315-03（blob URL の解放）**: `PendingPostsSection.tsx:139-140` の `URL.createObjectURL` をレンダー内呼び出しから外し、`useMemo` で生成 ＋ `useEffect` の cleanup で `revokeObjectURL` する（`usePostForm.ts:56-64` と同型）。**下書きの写真プレビュー表示は変えない。**
- **FR-315-04（サインアウトの完了待ちと失敗表示）**: `Header.tsx:120` の `onSignOut` を `await signOut()` してからドロワーを閉じる形に変え、失敗時はエラートースト（または処理中スピナー＋完了後クローズ）を出す。`AuthContext.signOut`（`:70-72`）に catch を追加して unhandled rejection を消し、失敗を呼び出し側へ伝える（戻り値または throw のどちらにするかは実装時に決め、`AdminLayout.tsx:144-147` の呼び出し側も壊さない形にする）。**成功時の挙動（ドロワーが閉じる）は変えない。**
- **FR-315-05（処理中の閉鎖抑止）**: `DashboardPage.tsx:61-66` の背景オーバーレイボタンに `disabled={deleting}` を付け、`EditProfileModal.tsx:120-126` の背景ボタンに `disabled={saving}` を付ける。**Escape キーも処理中は無効化する**（`useEscapeKey` に無効化の引数を渡すか、ハンドラ側で早期 return）。処理が終わる（成功してモーダルが自ら閉じる／失敗してエラーが表示される）までモーダルを消せない状態にする。
- **FR-315-06（タイマーの cleanup）**: 3箇所を `FilterBar.tsx:58-59` と同型に直す。
  - `AuthCallbackPage.tsx:81` — タイマーIDを `useRef` に保持し、`useEffect` の cleanup（`:110`）で `clearTimeout` する。**メール確認完了画面から3秒以内に離脱しても `/dashboard` へ遷移しないこと**が本FRの主眼。
  - `providers.tsx:101-102` — タイマーIDを保持し、`cancelled` フラグと同じ cleanup で `clearTimeout` する。
  - `LikeShareSection.tsx:109` — 同様に cleanup する。
- **FR-315-07（`/dashboard` の h1）**: `DashboardPage.tsx` に `<h1>` を1つ追加する。`src/app/(home)/page.tsx:17` と同じ **sr-only** の手法で、**既存のレイアウト・デザインを変えない**。文言は i18n キー経由にする（`:208` の h2 は表示名なので、h1 はページの主題＝マイページ／ダッシュボードを表す文言にする）。既存の `<h2>`（`:208`）以下の階層は変えない。
- **FR-315-08（実行リージョンの明示）**: `vercel.json` に `"regions": ["hnd1"]` を追加し、**設定がリポジトリ上でレビュー可能・再現可能な状態にする**。あわせて `docs/runbooks/` に「Vercel 実行リージョンと Supabase リージョンを一致させる」旨と、現在の Supabase プロジェクトのリージョン（実測して記録する）を残す。`api/og` は `runtime = 'edge'` のため影響を受けないことを併記する。**適用前後で ISR ページの応答時間を1回計測して記録する**（効果の有無を主張ではなく実測で残す）。
- **FR-315-09（回帰テスト）**: 少なくとも次の2つをテストで固定化する。(a) `AuthCallbackPage` がアンマウント後に `router.replace` を呼ばないこと（fake timers でタイマーを進める）、(b) 処理中（`deleting` / `saving` が true）に背景オーバーレイをクリックしても `onClose` が呼ばれないこと。
