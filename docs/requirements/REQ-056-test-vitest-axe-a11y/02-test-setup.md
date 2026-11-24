## テスト種別と環境
- **種別**: unit（a11y smoke test）
- **フレームワーク**:
  - `vitest-axe`（新規 devDependency, S コスト）
  - 既存 `@testing-library/react`, `@testing-library/jest-dom`
- **セットアップ**:
  - `package.json` に `"vitest-axe": "^0.1.0"` を追加
  - `vitest.setup.ts` 末尾に以下を追加:
    ```ts
    import { toHaveNoViolations } from 'vitest-axe/matchers'
    import 'vitest-axe/extend-expect'
    import { expect } from 'vitest'
    expect.extend(toHaveNoViolations)
    ```
  - 型定義: `vitest-axe/extend-expect` が自動拡張する想定。必要なら `src/types/vitest-axe.d.ts` で `interface Assertion` を宣言拡張
- **配置先**:
  - `src/components/features/posts/__tests__/PostForm.a11y.test.tsx`
  - `src/components/features/posts/__tests__/WeatherSelector.a11y.test.tsx`
  - `src/components/modals/__tests__/AuthModal.a11y.test.tsx`
  - `src/components/modals/__tests__/EditDialog.a11y.test.tsx`
  - `src/views/admin/__tests__/AdminLayout.a11y.test.tsx`
  - `src/app/post/[id]/__tests__/DetailPageClient.a11y.test.tsx`
