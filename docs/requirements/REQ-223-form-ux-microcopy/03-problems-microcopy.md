### 3. CTA（送信ボタン）の文言が「動詞＋成果」で統一されていない

`02_writing_copywriting.md` の「動詞＋成果」原則に対し、現状は混在：

- **準拠している例**：PostForm の `postForm.submit` = 「🦞 投稿する」（`src/locales/ja/translation.json:135`）、SurveyRequestForm の `survey.submit` = 「調査依頼を投稿する」（`:356`）、CommentSection の `comment.submit` = 「コメントする」（`:198`）。これらは動詞＋成果で良い。
- **非準拠／要検討の例**：
  - `auth.submitLogin` = 「ログイン」（`src/locales/ja/translation.json:333`）は名詞寄り（「ログインする」の方が動詞＋成果に近い。`submitSignup`=「登録する」`:334`・`submitReset`=「メールを送信」`:335` は動詞化済みで、ログインだけ表記が不揃い）。
  - ReportModal の `report.submit` = 「通報する」（`:395`）は動詞だが、`common.submit` 系の汎用「送信」（`survey` の旧 `submit`「送信」`:296` 等、文脈不明な「送信」が複数キーに残存）との整理が必要。
- 4 言語間でも整合が必要：`survey.submit` は en「Submit Request」/ ko「조사 요청 제출」/ zh「提交调查请求」（各 `:356`）と訳されており、ja を「動詞＋成果」に寄せる場合は 4 言語横断で見直す。

### 4. エラー文が「何が・なぜ・どう直すか＋具体例」になっていない箇所がある

`02_writing_copywriting.md` のエラー文原則（何が起きたか・なぜか・どう直すか・できれば具体例）に対し：

- PostForm の位置エラー `postForm.locationError` = 「地図上で場所を選択してください」（`src/locales/ja/translation.json:105`）は「どう直すか」はあるが、なぜ必須か・どこをタップするかの具体性が弱い。SurveyRequestForm の `survey.errors.noPosition` = 「地図をタップして場所を選択してください」（`:373`）の方が動作（タップ）まで具体的で、フォーム間で粒度が不揃い。
- 個体数エラー `postForm.countValidation` = 「個体数は{{min}}〜{{max}}の整数で入力してください」（`:122`）は範囲を示しており良い例。コメント超過 `postForm.commentValidation`（`:131`）も同様。これらの良い粒度に他のエラー文（位置・理由・ファイル形式・サイズ）を揃える。
- ファイル形式・サイズのエラーは **ハードコードの日本語**で i18n 化されていない：`src/hooks/usePostForm.ts:62`（「対応していないファイル形式です（JPEG, PNG, WebP, HEIC のみ）」）、`:64〜68`（「ファイルサイズが5MBを超えています」）、`:104,106`（画像ゲート警告）。エラー本文に**何が・どう直すか**は含むが、`t()` 経由でなく 4 言語化されていない（en/ko/zh では日本語が露出）。
