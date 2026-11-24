## 影響範囲

**本 REQ が担う範囲（入力体験＋マイクロコピー）:**
- `src/lib/formStyles.ts`（`formInputCls`/`dialogInputCls` の入力欄 16px 化）
- `src/components/features/posts/PostForm.tsx`（数値 `inputmode`、送信ハンドラ再入ガード、CTA/エラー文言の差し替え）
- `src/components/features/posts/WeatherSelector.tsx`（気温=decimal / 湿度=numeric）
- `src/components/modals/AuthModal.tsx`（メール `inputmode`/`enterkeyhint`、独自 `inputCls` の 16px 化、CTA 文言、再入ガード）
- `src/components/modals/SurveyRequestForm.tsx`（送信ボタンを `disabled={loading}` のみへ、独自 `inputCls` の 16px 化、再入ガード）
- `src/hooks/usePostForm.ts`（ファイル形式/サイズ/画像ゲートのエラー i18n 化）
- `src/views/AuthCallbackPage.tsx` / `src/views/admin/AdminLoginPage.tsx`（email/password の `inputmode`/`autocomplete`/`enterkeyhint` 整備）
- `src/locales/{ja,en,ko,zh}/translation.json`（CTA・エラー・ファイル系の文言キーを 4 言語で追加/改訂）

**本 REQ が担わない範囲（既存 REQ との境界＝重複回避）:**
- **REQ-029**（フォーム UX：リアルタイムバリデーション・未保存保護〔`beforeunload`〕）＝検証の発火タイミング・未保存保護ロジックは REQ-029 の責務。本 REQ は文言と入力体験のみ。
- **REQ-213**（入力検証の zod 統一）＝検証ロジック・許可リスト・閾値・`safeParse` 導入は REQ-213。本 REQ は検証を新設せず、その**エラー文言の見せ方**だけを整える。
- **REQ-151**（label-input 関連付け／`htmlFor`・`id`・`role="group"`）＝関連付け属性は REQ-151。本 REQ は属性を壊さず維持する。
- **REQ-189**（SurveyRequestForm の a11y：focus trap・ダイアログ名・`aria-pressed`・エラーの `role="alert"`・閉じるボタン名）＝a11y 属性は REQ-189 が主管。本 REQ は同フォームの**送信可否方針（押せる化）と文言**のみを扱い、REQ-189 と協調（FR-223-07）。
- コントラスト/カラートークン/色覚対応は **REQ-224** と協調（本 REQ はタップ領域・文言・入力体験に集中）。Loading/Empty/Error の 3 状態体系は **REQ-222** が主管。

**他機能への影響リスク:**
- `formInputCls`/`dialogInputCls` は 7 コンポーネントで共有のため、16px 化はモーダル内の行高・折返しに波及しうる。各共有先の表示を確認する。
- CTA/エラー文言の差し替えは 4 言語同時更新が前提。1 言語のみ変更すると他言語でフォールバック露出が起きるため、必ず 4 ファイルをまとめて変更する。
- SurveyRequestForm の `disabled` 緩和は、未入力での誤送信を**押下時バリデーション**で必ず止めること（FR-223-07／AC-05）が前提。
