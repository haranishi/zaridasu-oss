### モック設計

テストで共通して必要になるモックを `src/test/mocks/` に集約する。

#### supabase.js モック（`src/test/mocks/supabase.js`）

```javascript
// vi.mock('@/lib/supabase') で使用
export const supabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  })),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: { path: 'anon/test.jpg' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
    })),
  },
  auth: {
    signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { identities: [{}] } }, error: null }),
  },
}
```

#### auth.js モック（`src/test/mocks/auth.js`）

```javascript
export const mockUseAuth = (overrides = {}) => ({
  user: null,
  isAdmin: false,
  isEmailConfirmed: true,
  loading: false,
  ...overrides,
})
```

#### localStorage モック（setup.js に追加）

```javascript
// スパム制限テスト用
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})
```

---

### カバレッジ目標

| 対象 | 目標カバレッジ | 計測方法 |
|------|--------------|---------|
| `src/hooks/` | 80% | v8 coverage |
| `src/utils/` | 90% | v8 coverage |
| `src/components/features/posts/` | 70% | v8 coverage |
| `src/components/modals/` | 60% | v8 coverage |
| 全体 | 60% | v8 coverage |

```bash
# カバレッジレポート生成コマンド（既存 package.json に定義済み）
npm run test:coverage
```

---

### 実装スケジュール（推奨）

```
Week 1:
  Day 1-2: src/test/mocks/ の作成（supabase, auth, i18n）
  Day 3-4: usePostForm.test.js（バリデーション・スパム・uploadPhotos）
  Day 5:   useDeletePost.test.js + useReverseGeocode.test.js

Week 2:
  Day 1-2: PostForm バリデーションテスト
  Day 3-4: AuthModal.test.jsx
  Day 5:   errorHandler.test.js + CI 設定
```

---

---
