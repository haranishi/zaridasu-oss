## カバレッジ目標
- ここでのカバレッジ目標は行/分岐ではなく a11y violation カテゴリ:
  - `label` カテゴリ: violations = 0
  - `button-name` / `link-name` / `image-alt`: violations = 0
  - `aria-*` 系（aria-valid-attr, aria-required-attr 等）: violations = 0
  - `color-contrast` は warnings（参考値）

## テストデータ / フィクスチャ
- PostForm 用 wrapper: `src/test-utils/renderWithProviders.tsx`（Theme/Auth/Toast/i18n を束ねる。既存の各テストで類似パターンがあれば再利用）
- EditDialog 用 post: `src/components/modals/__tests__/fixtures/post.ts` に `{ id:1, species:'american', info_type:'sighting', ... }` を作成
- axe option: `{ rules: { 'color-contrast': { enabled: false } } }` を `src/test-utils/axeConfig.ts` で共通化
