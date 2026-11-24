## 目的

- 投稿・認証・調査依頼の各フォームを、`フォームデザイン.md` の基本原則（**1 カラム・ラベル外出し常時表示・適切なタップ領域・CTA は常に押せてクリック時にエラー集約**）に沿って点検・是正する。
- `アクセシビリティとUXライティング.md` に沿って **モバイルキーボード最適化（`type`/`inputmode`/`autocomplete`/`enterkeyhint`）と入力欄 16px 化（iOS 自動ズーム防止）** を行い、現地スマホ投稿の入力体験を底上げする。
- `02_writing_copywriting.md` に沿って **CTA を「動詞＋成果」に統一し、エラー文を「何が・なぜ・どう直すか＋具体例」に揃え、ハードコード日本語を i18n 化して 4 言語（ja/en/ko/zh）で統一**する。
- 二重送信を **送信ハンドラ先頭の再入ガード（処理中なら早期 return）＋ UI `disabled`** の二層で防ぎ、サーバー側冪等（DB レートリミット・hash dedup）が最終防衛である旨を整理する。
- **検証ロジック・ラベル関連付け・a11y 属性は本 REQ で新設しない**（REQ-029 / REQ-213 / REQ-151 / REQ-189 に委ねる）。本 REQ は既存検証の「文言」と「入力体験」だけを整える。

## 要件

### 機能要件

- [ ] FR-223-01: **入力欄を 16px 以上にして iOS 自動ズームを防ぐ。** 共通スタイル `src/lib/formStyles.ts:7`（`formInputCls`）・`:16`（`dialogInputCls`）の `text-sm`（14px）を、入力欄に限り 16px 相当（`text-base`、必要なら `md:text-sm` でデスクトップのみ縮小）に変更する。`AuthModal` の独自 `inputCls`（`src/components/modals/AuthModal.tsx:213`）・`SurveyRequestForm` の独自 `inputCls`（`src/components/modals/SurveyRequestForm.tsx:79`）も同方針に揃える（可能なら独自定義をやめ共通関数へ寄せて DRY 化）。**ラベル・補助テキスト・カウンターの文字サイズは変えない**（入力欄〔input/textarea/select〕のフォントのみ 16px 化）。視覚デザインの大崩れが無いことを確認する。

- [ ] FR-223-02: **数値入力に `inputmode` を付与する。** 個体数（`src/components/features/posts/PostForm.tsx:368`）・調査時間（`:406`）・湿度（`src/components/features/posts/WeatherSelector.tsx:109`）に `inputMode="numeric"` を、気温（小数可、`WeatherSelector.tsx:104`）に `inputMode="decimal"` を付与する。`type="number"` は維持し（ブラウザ検証・スピナーを保つ）`inputMode` を併用する。

- [ ] FR-223-03: **メール／パスワード入力のモバイル最適化を補完する。** `AuthModal` のメール入力（`src/components/modals/AuthModal.tsx:329-348`）に `inputMode="email"` を追加し（既存 `type="email" autoComplete="email"` は維持）、`enterKeyHint`（メール欄は `next`、最終欄は `done`／`go`）を付与する。`AuthCallbackPage`（`src/views/AuthCallbackPage.tsx:160,178`）・`AdminLoginPage`（`src/views/admin/AdminLoginPage.tsx:170,182`）の email/password も同方針で `inputMode`/`autoComplete`（`current-password`/`new-password`）/`enterKeyHint` を揃える。既存の `autoComplete` 値（`AuthModal.tsx:344,365,394`）は壊さない。

- [ ] FR-223-04: **CTA を「動詞＋成果」に統一する（4 言語）。** 文脈の薄い「送信」系を排し、各 CTA を動詞＋成果に揃える。少なくとも `auth.submitLogin`（`src/locales/ja/translation.json:333`「ログイン」→「ログインする」等）を `submitSignup`「登録する」・`submitReset`「メールを送信」と表記揃えする。`survey` 等に残る汎用「送信」キー（`:296` 等の文脈不明な `submit`）の要否を点検し、使われていなければ整理、使われていれば成果を明示した文言にする。**変更は必ず ja/en/ko/zh の 4 ファイル（`src/locales/{ja,en,ko,zh}/translation.json`）を同時に更新**し、訳ぶれ（en の `Submit` 連発、zh の「提交」連発）も成果が分かる表現に寄せる。**ボタンの絵文字（🦞 等）は既存方針を尊重**し、過度な装飾追加はしない。

- [ ] FR-223-05: **エラー文を「何が・なぜ・どう直すか＋具体例」に揃える（4 言語）。** 粒度の良い既存文言（`postForm.countValidation` `:122`・`postForm.commentValidation` `:131`・`survey.errors.noPosition` `:373`）を基準に、粒度の弱い文言を補強する。少なくとも `postForm.locationError`（`:105`「地図上で場所を選択してください」）を SurveyRequestForm 同様「地図をタップして場所を選択してください」相当の動作具体形に揃える。フォーム間で同義のエラー（位置未選択・理由空）は**同一トーンの文言に統一**する。新規・改訂キーは 4 言語に反映する。

- [ ] FR-223-06: **ファイル形式・サイズ・画像ゲートのエラーを i18n 化する。** `src/hooks/usePostForm.ts:62`（形式不一致）・`:64-68`（5MB 超過）・`:104`（低解像度）・`:106`（ブレ）のハードコード日本語を `t()` 経由に置換し、`src/locales/{ja,en,ko,zh}/translation.json` に対応キー（例: `postForm.fileTypeError`・`postForm.fileSizeError` ＝許容形式 `JPEG/PNG/WebP/HEIC`・上限 `5MB`・`MAX_PHOTOS` を補間）を追加する。文言は「何が・どう直すか」を保ち、許容形式とサイズ上限を**具体例として明示**する（定数 `MAX_FILE_SIZE`/`ALLOWED_IMAGE_TYPES`/`MAX_PHOTOS`〔`src/lib/constants.ts:176-177`〕と矛盾させない）。

- [ ] FR-223-07: **SurveyRequestForm の送信ボタンを「常に押せてクリック時に集約」方式へ統一する。** `src/components/modals/SurveyRequestForm.tsx:202` の `disabled={loading || !position || !reason.trim()}` から `!position || !reason.trim()` を外し `disabled={loading}` のみにする。未入力時は既存の `handleSubmit` 内バリデーション（`:55-56`、`survey.errors.noPosition`/`noReason`）に到達させ、エラー領域（`:193-197`）に表示する。**a11y 属性（`role="alert"`・`aria-live`・ダイアログ名）は REQ-189 が主管**のため本 REQ では送信可否方針＋文言のみを扱い、REQ-189 と矛盾しない形（PostForm 方式に揃える）にする。

- [ ] FR-223-08: **二重送信の再入ガードを送信ハンドラに明示する。** PostForm（`handleSubmit` `src/components/features/posts/PostForm.tsx:165`）・AuthModal（`handleSubmit` `src/components/modals/AuthModal.tsx:118`）・SurveyRequestForm（`handleSubmit` `src/components/modals/SurveyRequestForm.tsx:53`）の各送信ハンドラ冒頭に、**処理中なら即 return する同期ガード**（例: `if (loading) return`、または `useRef` フラグで `state` 反映前の連打も塞ぐ）を追加する。あわせて、二重送信に対する**最終防衛はサーバー側冪等**（DB レートリミット `check_post_rate_limit`〔`usePostForm.ts:358`〕・画像 hash dedup〔`:311-314`〕）である旨をコードコメントで明記する。UI の `disabled` はあくまで第一の網であることを整理する。
