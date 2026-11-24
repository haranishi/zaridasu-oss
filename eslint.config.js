import js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import nextPlugin from '@next/eslint-plugin-next'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

const jsxA11yRecommendedErrorRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([ruleName, ruleConfig]) => [
    ruleName,
    Array.isArray(ruleConfig) ? ['error', ...ruleConfig.slice(1)] : 'error',
  ]),
)

export default [
  // 解析対象外
  {
    ignores: ['dist/**', '.next/**', '.open-next/**', '.wrangler/**', 'scripts/migration/.runtime/**', 'cloudflare-env.d.ts', 'node_modules/**', 'coverage/**', 'api/**', 'src/types/**', 'src/workers/**', 'playwright-report/**', 'test-results/**'],
  },

  // REQ-297: CLI scripts とルート設定も TypeScript/ESLint の静的検査対象にする。
  {
    files: ['scripts/**/*.{ts,mjs}', 'cloudflare/**/*.ts', '*.config.{ts,js,mjs}', 'vitest.setup.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-console': 'off',
      // 既存 CLI/config の外部入力境界では any を使う箇所がある。型安全性は tsc で担保する。
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Next.js の CommonJS 呼び出しに合わせた、依存置換用の小さなパッケージ。
  {
    files: ['tools/{next-eslint-glob,node-minify-glob}/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: js.configs.recommended.rules,
  },

  // REQ-297: Playwright の e2e も lint 対象にする。
  {
    files: ['tests/e2e/**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // JS/JSX ファイル
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...jsxA11yRecommendedErrorRules,
      // plugin 推奨設定に残る非推奨ルールで、正しい htmlFor/id にも nesting を同時要求するため、
      // 後継の label-has-associated-control を error として有効化し、こちらだけ無効化する。
      'jsx-a11y/label-has-for': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'error',
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
    },
  },

  // TS/TSX ファイル（TypeScriptパーサー使用）
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...jsxA11yRecommendedErrorRules,
      // plugin 推奨設定に残る非推奨ルールで、正しい htmlFor/id にも nesting を同時要求するため、
      // 後継の label-has-associated-control を error として有効化し、こちらだけ無効化する。
      'jsx-a11y/label-has-for': 'off',
      // TypeScript handles unused vars via tsc
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      // REQ-214: サーバー側で `*.auth.getSession()` を認可に使わせない。
      // getSession() は Cookie をそのまま返すだけで Auth サーバー検証をしないため、
      // SSR / Server Component / Server Action / Route Handler / middleware では
      // getUser() (Auth サーバー検証) / getClaims() (JWT 署名検証) を使う。
      // クライアント表示用の唯一の正規利用 (src/context/AuthContext.tsx) と
      // テストは下の override で除外する。AST セレクタにより getSessionCache() /
      // getUserMedia() / auth.admin.getUserById() は誤検出されない。
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']",
          message:
            'サーバー側で getSession() を認可に使わないでください (REQ-214)。Cookie 改ざんに弱いため getUser() / getClaims() を使ってください。クライアント表示用途は use client コンポーネント (AuthContext) に限定します。',
        },
        // DB アクセスを src/lib/data/ に集める。`.from('テーブル名')` を各所に書くと、
        // 「公開とは何か」「どの列を出してよいか」の判定が散り、仕様を変える日に全部を探して回る
        // ことになる（2026-09-14 の実測で 36 ファイル・86 箇所、うち公開判定の直書きが 18 箇所）。
        // とくに REQ-243（生 lat/lng は列 GRANT 剥奪済み。粗化列 display_lat/display_lng を使う）は
        // 破ると実行時に落ちるか、権限次第では粗化前の座標が出る。
        //
        // 文字列リテラルを渡す `.from()` だけを見る。`Array.from({length})` / `Buffer.from(buf)` は
        // 引数が Literal でないため当たらないが、**`Array.from('abc')` は当たってしまう**ので
        // 組み込みを名前で外す（2026-09-14 に検証で踏んだ）。`supabase.storage.from('バケット名')` は
        // DB テーブルではないので同じく外す（この層が扱うのはテーブルだけ）。
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.type='Literal']" +
            ":not([callee.object.property.name='storage'])" +
            ":not([callee.object.name='Array']):not([callee.object.name='Buffer'])" +
            ":not([callee.object.name='Object'])",
          message:
            "DB アクセスは src/lib/data/ に置いてください。`.from('テーブル名')` を直に書くと、公開条件や列の組が各所に散ります（REQ-243 の粗化座標もそこで守られます）。まだ移していないファイルは eslint.config.js の除外リストにあります。",
        },
      ],
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
    },
  },

  // a11y lint の検出力を確認する意図的な不正マークアップ。実装コードでは同ルールを error のまま維持する。
  {
    files: [
      'src/components/features/posts/__tests__/PostForm.a11y.test.tsx',
      'src/components/modals/__tests__/SurveyRequestForm.a11y.test.tsx',
    ],
    rules: {
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },

  // REQ-302 の変更禁止ファイルに残る既存違反は後続要件で個別修正する。
  // ルール自体は error のままにし、既存箇所だけを限定除外して新規退行を検出する。
  {
    files: [
      'src/components/features/collection/SpeciesDexCard.tsx',
      'src/views/admin/AdminCommentsPage.tsx',
      'src/views/admin/AdminExperimentsPage.tsx',
      'src/views/admin/AdminPostsPage.tsx',
      'src/views/admin/AdminUsersPage.tsx',
    ],
    rules: {
      'jsx-a11y/control-has-associated-label': 'off',
    },
  },
  {
    files: [
      'src/components/features/posts/AudioRecorder.tsx',
      'src/components/ui/AudioPlayer.tsx',
    ],
    rules: {
      'jsx-a11y/media-has-caption': 'off',
    },
  },
  {
    files: [
      'src/components/features/posts/MicPermissionGuide.tsx',
      'src/components/features/posts/PostForm.tsx',
      // REQ-329: 背景クリックで閉じるモーダル（PostForm と同じ作り）
      'src/components/features/map/QuickSaveSheet.tsx',
      'src/components/modals/SurveyRequestForm.tsx',
      'src/components/ui/PhotoViewer.tsx',
    ],
    rules: {
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
    },
  },
  {
    files: ['src/views/admin/AdminAiCostPage.tsx'],
    rules: {
      'jsx-a11y/no-redundant-roles': 'off',
    },
  },

  // REQ-214: クライアント表示用 getSession の唯一の正規利用箇所。
  // 'use client' コンポーネントで isAdmin の UI 出し分けに使うため認可禁止ルールから除外する。
  // ('use client' ディレクティブに基づく網羅的な除外は auth-route:check スクリプトが担う)
  {
    files: ['src/context/AuthContext.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // データ層そのものは `.from()` を使う側なので、DB アクセス禁止の対象から外す。
  // REQ-214 の getSession 禁止は残す。
  {
    files: ['src/lib/data/**/*.{ts,tsx}', 'src/features/*/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']",
          message:
            'サーバー側で getSession() を認可に使わないでください (REQ-214)。Cookie 改ざんに弱いため getUser() / getClaims() を使ってください。クライアント表示用途は use client コンポーネント (AuthContext) に限定します。',
        },
      ],
    },
  },

  // DB アクセスを src/lib/data/ へ集める移行の途中。**ルールは error のまま残し、
  // 既存の違反ファイルだけを個別に外して新規の退行を止める**（REQ-302 で a11y ルールに
  // 使ったのと同じやり方）。移し終えたファイルはこのリストから消すこと。
  //
  // ここで `no-restricted-syntax: 'off'` と書くと REQ-214 の getSession 禁止まで一緒に
  // 無効化されるので、**getSession のセレクタだけを残して再宣言する**。
  {
    files: [
      'src/app/dataset/zaridasu.csv/route.ts',
      'src/app/lp/page.tsx',
      // 角括弧はグロブの文字クラスとして解釈されるため、`[id]` を直に書くと**マッチしない**。
      // ワイルドカード 1 セグメントで受ける（2026-09-14 に踏んだ）。
      'src/app/post/*/page.tsx',
      'src/app/profile/*/page.tsx',
      'src/app/request/*/page.tsx',
      'src/app/sitemap.ts',
      'src/components/features/dashboard/MyPostsSection.tsx',
      'src/components/features/posts/CommentSection.tsx',
      'src/components/modals/ReportModal.tsx',
      'src/hooks/admin/useAdminStats.ts',
      'src/hooks/survey/useSurveyRequestComments.ts',
      'src/hooks/survey/useSurveyRequests.ts',
      'src/hooks/survey/useSurveyResponses.ts',
      'src/hooks/useGeminiAuthBanner.ts',
      'src/hooks/useLike.ts',
      'src/hooks/useOnboardingStatus.ts',
      'src/hooks/useProfile.ts',
      'src/hooks/usePushSubscription.ts',
      'src/hooks/useStats.ts',
      'src/lib/auditLog.ts',
      'src/lib/onboarding/complete.ts',
      'src/views/admin/AdminCommentsPage.tsx',
      'src/views/admin/AdminReportsPage.tsx',
      'src/views/SurveyRequestPage.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']",
          message:
            'サーバー側で getSession() を認可に使わないでください (REQ-214)。Cookie 改ざんに弱いため getUser() / getClaims() を使ってください。クライアント表示用途は use client コンポーネント (AuthContext) に限定します。',
        },
      ],
    },
  },

  // テストファイル: no-console 無効化 + node/vitest グローバル追加
  {
    files: ['src/**/__tests__/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // REQ-214: テストは getSession をモック/呼び出すため認可禁止ルールの対象外
      'no-restricted-syntax': 'off',
    },
  },
]
