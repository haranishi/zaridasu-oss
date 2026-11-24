## 機能要件

### FR-001: 環境変数のセキュリティ強化
- **説明:** `.env` をgitignoreに追加済みだが、git履歴に残っている可能性があるため `.env` / `.env.local` を確実にgit管理外にする
- **処理:**
  1. `.gitignore` に `.env` / `.env.local` が含まれていることを確認
  2. git tracked な `.env` ファイルがあれば `git rm --cached` で除外
  3. APIキーのローテーションはユーザーが手動で実施（Supabase Console / Google Cloud Console）
- **バリデーション:** `git ls-files .env` が空であること
- **エラーハンドリング:** なし（手動操作）

### FR-002: Admin権限のサーバーサイド検証
- **説明:** `src/lib/supabase/middleware.ts` で `/admin/*` ルートにアクセスするユーザーのroleをサーバーサイドで検証する
- **入力:** HTTPリクエスト（`/admin/*` パスへのアクセス）
- **処理:**
  1. Supabase server clientで `getUser()` を呼び出し
  2. `user.app_metadata.role === 'admin'` をチェック
  3. admin でない場合は `/` にリダイレクト
- **出力:** 認可済みリクエスト or リダイレクトレスポンス
- **エラーハンドリング:** セッション取得失敗時は `/admin/login` にリダイレクト

### FR-003: Google Analytics IDの環境変数化
- **説明:** `src/app/layout.tsx` にハードコードされた `G-NQ6EFZWP30` を `NEXT_PUBLIC_GA_ID` 環境変数から読み込む
- **処理:**
  1. `layout.tsx` の GA スクリプトを条件付きレンダリングに変更
  2. `NEXT_PUBLIC_GA_ID` が未設定の場合はGAスクリプトを出力しない
- **バリデーション:** 環境変数が空の場合はスクリプトを非表示

### FR-004: i18n escapeValue の有効化
- **説明:** `src/lib/i18n.ts` の `interpolation.escapeValue` を `true` に変更（React の場合、React自身がエスケープするため `false` が推奨）
- **処理:** 現状の `false` は React + i18next では推奨設定のため、変更不要と判断。ただし、`dangerouslySetInnerHTML` で翻訳値を使用していないことを確認する
- **備考:** React の JSX 内での `{t('key')}` は React がエスケープするため `escapeValue: false` は安全。変更不要。

### FR-005: vitest.config.ts のプラグイン不整合修正
- **説明:** Vite メインパッケージと Vitest バンドル版の Vite 間でプラグイン型の不整合が発生
- **処理:**
  1. `vitest.config.ts` から `@vitejs/plugin-react` の直接使用を削除
  2. Vitest 単体の設定のみ残す（Next.js ビルドは `next build` が担当）
- **バリデーション:** `npx vitest run` がエラーなく実行できること

### FR-006: テスト失敗の修正
- **説明:** usePostForm テスト17件 + HomePage テスト2件の失敗を修正
- **処理:**
  1. usePostForm: モック設定のパス不整合を修正（`@/lib/supabase` → 実際のパス）
  2. HomePage: MapView/FAB の描画条件を確認し、テストのモック/セットアップを修正
- **バリデーション:** 全テストがパスすること

### FR-007: TypeScript エラーの修正
- **説明:** テストファイルで必須propsが不足
- **処理:**
  1. `BarChart.test.tsx`: `dark` prop を追加（3箇所）、`data` prop を追加（1箇所）
  2. `StatCard.test.tsx`: `value` prop を追加（1箇所）
  3. `PostCard.test.tsx`: `currentUserId` → `useAuth` モックに変更
  4. `TrendsPage.test.tsx`: `useStats` のモック型を修正
- **バリデーション:** `tsc --noEmit` がエラー0件

### FR-008: ESLint Next.js プラグイン追加
- **説明:** `eslint.config.js` に Next.js 用の ESLint プラグインを追加
- **処理:**
  1. `@next/eslint-plugin-next` をインストール
  2. `eslint.config.js` に Next.js プラグイン設定を追加
- **バリデーション:** `next lint` が警告なく完了すること
