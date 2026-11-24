### 5. CTA を常に押せる方針が SurveyRequestForm だけ守られていない（二重送信防止と整合）

- `フォームデザイン.md` の「CTA は常に押せて、クリック時にエラーを集約」原則に対し、PostForm は **送信ボタンを `disabled={loading}` のみ**にし（`src/components/features/posts/PostForm.tsx:490`）、未入力時は `handleSubmit` 内でバリデーションして `role="alert" aria-live="assertive"` のエラーバナー（`:253-273`）に集約する正しい実装になっている。AuthModal も `disabled={loading}` のみ（`src/components/modals/AuthModal.tsx:438`）。
- 一方 **SurveyRequestForm は `disabled={loading || !position || !reason.trim()}`**（`src/components/modals/SurveyRequestForm.tsx:202`）で、位置未選択・理由空のときボタンが押せない。そのため `handleSubmit` 内の `survey.errors.noPosition` / `noReason`（`:55-56`）に**到達できず**、「なぜ押せないか」がユーザーに伝わらない。これは REQ-189 が指摘した同フォームの a11y 課題（押せない送信ボタン）と同根で、本 REQ では**マイクロコピー＋押下時集約の観点**から PostForm 方式への統一を扱う（a11y 属性側は REQ-189 と協調）。

### 6. 二重送信防止が UI の `disabled` 頼みで、明示的なガードが薄い

- 二重送信は現状、**送信中フラグ `loading`/`setLoading` による `disabled`**（PostForm `:490`、AuthModal `:438`、SurveyRequestForm `:202`）と、サーバー側冪等性（`usePostForm.ts` の DB レートリミットトリガー `check_post_rate_limit`〔`:191,358` 参照〕、画像 hash dedup〔`:131,311-314`〕）に依存している。`grep -rn "isSubmitting\|submitting" src/hooks src/components` の通り `loading` 系の状態はあるが、`isSubmitting` のような専用ガードや、送信ハンドラ冒頭での再入防止（処理中なら早期 return）は明示化されていない。
- `loading` 状態は非同期処理の `setLoading(true)` 後に立つため、**ボタン連打のごく短い隙（state 反映前）に二重発火する余地**がある（推測：React の state 更新は非同期で、`onClick`→`setLoading` 反映前に 2 回目が走り得る）。送信ハンドラ先頭での同期的な再入ガードがあると堅い。
