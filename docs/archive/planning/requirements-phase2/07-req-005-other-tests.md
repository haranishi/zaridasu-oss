#### 優先度 高: PostForm のバリデーションテスト（週1）

```
PostForm.test.jsx:
  送信バリデーション:
    - position が未設定の場合、エラーメッセージを表示して送信しない
    - count が COUNT_MIN 未満(0)の場合、エラーを表示
    - count が COUNT_MAX 超過(1000)の場合、エラーを表示
    - count が整数でない(1.5)の場合、エラーを表示
    - comment が MAX_COMMENT_LENGTH(500文字)超過の場合、エラーを表示
    - honeypot フィールドに値がある場合は送信しない（ボット対策）

  送信成功:
    - 必須項目のみ入力した場合に submitPost を呼ぶ
    - 成功後に toast.success が表示される
    - 成功後に onClose と onSuccess が呼ばれる
    - 成功後に草稿がクリアされる

  草稿復元:
    - loadDraft() にデータがある場合に各フィールドが復元される
    - 「草稿をクリア」を押すと clearDraft() が呼ばれてバナーが消える
```

#### 優先度 中: 認証フロー（週2）

```
AuthModal.test.jsx:
  タブ切り替え:
    - ログイン/新規登録/パスワードリセット のタブが切り替わる
    - タブ切り替え時にエラーがリセットされる

  ログインフォーム:
    - 正常ログイン時に onClose が呼ばれる
    - エラー時に日本語エラーメッセージが表示される（AUTH_ERROR_MAPのマッピング確認）
    - loading 中はボタンが disabled になる

  新規登録フォーム:
    - パスワード不一致時にエラーを表示する
    - 既存メール時に「ログインする」ボタンが表示される
    - 未確認メール時に「再送信」ボタンが表示される

AuthCallbackPage.test.jsx:
  - type=signup → confirmed モードに遷移する
  - type=recovery → recovery モードに遷移する
  - otp_expired エラー → 期限切れメッセージを表示する
  - confirmed モードで 3秒後に自動遷移する（vi.useFakeTimers）
```

#### 優先度 中: エラーハンドリングユーティリティ（週2）

```
errorHandler.test.js:
  getErrorMessage():
    - P0001 エラー → PostgreSQL メッセージを返す
    - TypeError(fetch) → ネットワークエラーメッセージを返す
    - status=401 → セッション切れメッセージを返す
    - status=403 → 権限なしメッセージを返す
    - status=429 → レート制限メッセージを返す
    - null/undefined → 汎用エラーメッセージを返す

  logError():
    - DEV 環境では console.error が呼ばれる
    - PROD 環境では console.error が呼ばれない
```

#### 優先度 低: CI 設定（週2）

```
.github/workflows/test.yml:
  - push / pull_request で自動実行
  - npm ci → vitest run → coverage レポート生成
  - カバレッジが閾値未満の場合に CI を失敗させる
```

---
