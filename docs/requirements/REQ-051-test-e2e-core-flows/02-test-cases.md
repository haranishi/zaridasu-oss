## テストケース（Given/When/Then）

### TC-01: 未ログイン・ホームで地図ピンから詳細モーダルが開く
- **Given**:
  - seed に `status='approved'`、`lat=39.7186`、`lng=140.1024`（秋田市）の投稿 1 件
  - `storageState` は未指定（完全匿名ブラウザ）
- **When**:
  - `page.goto('/')`
  - `page.waitForSelector('.leaflet-container', { state: 'visible' })`
  - `page.waitForSelector('.leaflet-marker-icon')`
  - `page.locator('.leaflet-marker-icon').first().click()`
- **Then**:
  - `.leaflet-popup-content` または投稿詳細モーダル（`[role="dialog"]`）が visible
  - その中に seed で登録した species ラベル「アメリカザリガニ」が含まれる（INV-01）

### TC-02: 一般ユーザーの投稿が pending として保存される
- **Given**:
  - `storageState: 'tests/e2e/.auth/user.json'`（user@test.local でログイン済み）
  - seed にはこのユーザー所有の pending 投稿は存在しない
- **When**:
  - `page.goto('/')`
  - 投稿 FAB / ボタンをクリックして投稿モーダルを開く
  - species=アメリカザリガニ、info_type=目撃、map picker で lat=39.72 / lng=140.10 相当の位置をクリック、comment='E2E テスト投稿' を入力
  - 送信ボタンをクリック
- **Then**:
  - 成功トースト「投稿を受け付けました」等が表示される
  - Supabase service-role client で `posts` を `user_id = <user>` でクエリすると `status='pending'` の行が 1 件取得できる（API 経由で確認、`tests/e2e/helpers/db.ts`）
  - `is_official=false`、`is_flagged=false`、`status='pending'`（REQ-034 の INSERT トリガー連携、INV-02）

### TC-03: admin が承認すると public で approved として閲覧できる
- **Given**:
  - TC-02 で作成した `pending` 投稿 ID
  - `storageState: 'tests/e2e/.auth/admin.json'`（admin@test.local でログイン済み）
- **When**:
  - `page.goto('/admin/posts')`
  - 対象投稿の「承認」ボタンをクリック
  - トースト表示を待つ
  - `context.clearCookies()` してから `page.goto('/post/<id>')`（未ログインで再アクセス）
- **Then**:
  - `/admin/posts` 上で成功トースト「承認しました」等が表示される
  - `/post/<id>` のレスポンス status=200
  - ページ内に投稿 comment が描画されている（`status='approved'` なので `moderated_read` ポリシーで匿名閲覧可、INV-03）

### TC-04: chunk load error で error.tsx の日本語文言が表示される
- **Given**:
  - 未ログイン、`page.goto('/')` 完了直後
  - `page.route('**/_next/static/chunks/**/*.js', route => route.fulfill({ status: 500, body: 'chunk error' }))` を登録
- **When**:
  - 動的 import を発火するルート（たとえば `/admin/login` や Leaflet 再マウント）へ navigation
  - `window.dispatchEvent(new Event('error'))` 相当、または chunk を要求するリンクをクリック
- **Then**:
  - `src/app/error.tsx` が render する日本語文言「エラーが発生しました」がページに表示される
  - 「もう一度試す」等の再試行ボタンが visible
  - ボタン click で `router.refresh()` が呼ばれ、route interception を解除した後は正常画面に戻る（INV-04）
