## 機能要件

- **FR-301-01（エラー文言の i18n 経路統合）**: `AuthModal` のエラー表示を `errorHandler.getErrorMessage()` 経路へ寄せる。`AUTH_ERROR_MAP` は Supabase Auth 固有文言のマッピングとして残してよいが、**マップ外のフォールバックを `t('common.error')` にし、生メッセージを画面へ出さない**。生値は `logError` にのみ渡す。ネットワーク系は既存の `errors.network`、レート制限系は `errors.tooManyRequests` を使う。
- **FR-301-02（オフライン時は送信前に弾く）**: `AuthModal` に `useOnlineStatus` を導入し、オフライン時は Supabase へ送信せず `errors.network` を提示する（`PostForm` の REQ-197 と同方針）。**"Failed to fetch" が画面に出る経路をなくす。**
- **FR-301-03（不足文言の追加）**: メール形式エラー（"Unable to validate email address: invalid format"）など、現状マップ外で英語露出する文言に対応する i18n キーを追加する（例 `auth.errors.invalidEmailFormat`）。追加は4言語同時に行う。
- **FR-301-04（`authLoading` 中の CTA 制御）**: `HomePage.tsx:209-214`（`handlePostClick`）と :248-256（`onSurveyClick`）で `authLoading` を参照し、解決前はボタンを `disabled` にするかスピナーを出して**モーダルを開かない**。あわせて `user` が後から確定したら開いてしまった認証モーダルを閉じる effect（`CLOSE_AUTH`）を追加する。実装は同ファイルの `pendingSurveyRequestSeed` effect と同型にする。
- **FR-301-05（CAPTCHA トークンの消費順序修正）**: `AuthModal.handleSubmit` の**パスワード不一致・強度不足の検証（:283-291）を CAPTCHA トークン取得（:262）より前**へ移動する。あわせて `finally`（:352-358）の `resetCaptcha()` を**実際にサーバーへ送信した場合のみ**実行する（クライアント検証で return した経路ではトークンを維持する）。
- **FR-301-06（認証コールバックの表示文固定化）**: `AuthCallbackPage.tsx:50-59` の `error_code` をホワイトリスト化し、既知コードは対応する i18n キー、未知コードは `t('authCallback.errors.authFailed')` の固定文のみを表示する。**`error_description` を画面へ表示しない**（生値は `logError` にのみ渡す）。
- **FR-301-07（同期ガードの適用漏れ解消）**: `EditProfileModal.tsx:85`（`handleSave`）と `ReportModal.tsx:45`（`handleSubmit`）の冒頭に REQ-223 FR-223-08 と同型の同期ガードを追加する。
- **FR-301-08（回帰テスト）**: (a) オフライン状態での認証送信が `errors.network` を出し生英語文言を出さないこと、(b) パスワード不一致で return したあと再送信しても「CAPTCHAを完了してください」にならないこと、(c) `error_description` に任意文字列を渡しても画面には固定文のみが表示されること、をテストで固定化する。

## 受入基準

- **AC-01**: ネットワーク遮断状態でログイン/新規登録を送信すると、`errors.network` の当該言語の文言が表示され、**"Failed to fetch" などの英語生文言が一切表示されない**。
- **AC-02**: レート制限・メール形式エラーを含む既知の失敗ケースで、表示文言がすべて `t()` 経由の当該言語文になっている。未知エラーは `t('common.error')` にフォールバックする。
- **AC-03**: セッション解決中（`authLoading === true`）に「投稿する」「調査を依頼する」をタップしても認証モーダルが開かない。開いてしまった場合でも `user` 確定後に自動で閉じる。
- **AC-04**: パスワード確認欄を誤って送信 → 修正 → 即再送信、の流れで「CAPTCHAを完了してください」が出ない（CAPTCHA トークンが維持されている）。
- **AC-05**: `/auth/callback#error_code=x&error_description=<任意文>` を開いても、画面には i18n の固定文のみが表示され、URL 由来の文字列が表示されない。
- **AC-06**: プロフィール保存ボタン・通報送信ボタンを連打しても処理が二重に走らない。
- **AC-07**: 追加した i18n キーが ja/en/ko/zh 4言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-08**: `lint` / `type-check` / 既存652テストがパスする。

## 備考（要確認）

- FR-301-01 で `AUTH_ERROR_MAP` を残す場合、REQ-018D の方針（`already registered` を汎用文言に丸めてメール列挙を防ぐ）を壊さないこと。**汎用化はセキュリティ要件であり、親切な文言に置き換えてはならない。**
- FR-301-06 のホワイトリストに載せるべき `error_code` の実際の値の集合は、Supabase Auth 側の実装に依存するため**要確認**。少なくとも既存で分岐している `otp_expired` は含める。未知コードは固定文へ落とす設計なので、ホワイトリストが不完全でも安全側に倒れる。
- FR-301-05 の `resetCaptcha()` 条件化は「Turnstile トークンは単回使用」という前提（`AuthModal.tsx:267` のコメント）と両立させる必要がある。**送信した場合は必ずリセットする**を維持し、送信していない場合のみ維持する。
