## 機能要件

### FR-090-01: DrawerMenu に「調査依頼を立てる」項目を追加
- **説明:** ハンバーガーメニュー（左ドロワー）の「マップ設定」セクションと「その他リンク」セクションの間に、新規セクションまたは既存「その他リンク」直前にメニュー項目を追加
- **入力:** ユーザーがメニュー項目をタップ
- **処理:**
  1. `onClose()` を呼びドロワーを閉じる
  2. `onSurveyClick?.()` を呼ぶ
  3. ログイン判定は呼び出し元（`HomePage`）の責務（既存実装に従う）
- **出力:** ドロワーが閉じる → `SurveyRequestForm` が開く（または `AuthModal` に誘導）
- **バリデーション:** なし（イベント発火のみ）
- **エラーハンドリング:** `onSurveyClick` 未定義時は単に `onClose()` のみ呼ぶ（`?.` で防御）

### FR-090-02: Header → DrawerMenu に onSurveyClick を配線
- **説明:** `Header` で `onSurveyClick` を destructure し `DrawerMenu` に渡す
- **入力:** `Header` の Props として `onSurveyClick` が渡される
- **処理:** そのまま `<DrawerMenu onSurveyClick={onSurveyClick} ... />` に転送
- **出力:** ドロワー内のメニュー項目から `HomePage` の `OPEN_SURVEY_FORM` dispatch まで到達可能になる
- **バリデーション:** `onSurveyClick` は optional（`?:`）。Header 単独テストや他画面でも壊れないこと

### FR-090-03: SurveyRequestsListPage に新規依頼 FAB を追加
- **説明:** 一覧ページ右下に Floating Action Button を追加
- **入力:** ユーザーが FAB をタップ
- **処理:**
  1. ログイン状態判定（`useAuth().user`）
  2. ログイン済み → ローカル state `showCreateForm: true`
  3. 未ログイン → `router.push('/auth')` または AuthModal 誘導（一覧ページに AuthModal が無いなら router 遷移で十分）
- **出力:** `SurveyRequestForm` がページ内モーダルとして開く
- **バリデーション:** なし（フォーム本体に委譲）
- **エラーハンドリング:** フォーム送信エラーは `SurveyRequestForm` 内部で表示

### FR-090-04: SurveyRequestForm 開閉と一覧再取得の連携
- **説明:** 一覧ページ内に `SurveyRequestForm` を条件付きでマウントし、`onClose` / `onSuccess` をハンドル
- **入力:** FAB タップで `showCreateForm` が true
- **処理:**
  1. `<SurveyRequestForm onClose={() => setShowCreateForm(false)} onSuccess={() => fetchRequests()} />` をマウント
  2. `onSuccess` で一覧を再取得（既存 hook の `fetchRequests`）
  3. `onClose` でマウント解除
- **出力:** 新規依頼が一覧の先頭に表示される（既定ソートが `created_at desc` のため）
- **バリデーション:** なし
- **エラーハンドリング:** `onSuccess` 未呼び出し時は一覧は変わらないが UX 的に許容

### FR-090-05: 未ログイン時のフォールバック
- **説明:** ログインしていないユーザーが依頼ボタンを押したときの挙動
- **入力:** 未ログインで FAB / メニュー項目をタップ
- **処理:**
  - `HomePage` 経由（DrawerMenu 経由）: 既存実装通り `OPEN_SURVEY_FORM` 内で `if (user) ... else handleLoginClick('signup')` の現行ロジックを尊重（**signup 推奨**：依頼は新規ユーザー獲得トリガーになりやすい）
    - 注: 現在 `HomePage:158-161` は `signup` 誘導済み。配線が完了すれば自然に動く
  - `/requests` 経由: ローカル state を変えず、`router.push('/auth')` で AuthPage へ遷移
- **出力:** ログイン後に依頼を立てられる
- **エラーハンドリング:** `/requests` で `AuthModal` を直接マウントすることは可能だが、既存パターンに合わせて router 遷移を優先

---
