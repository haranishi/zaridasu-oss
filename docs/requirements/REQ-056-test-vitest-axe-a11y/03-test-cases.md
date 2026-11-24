## テストケース（Given/When/Then）

### TC-01: PostForm は axe violations がゼロ（INV-01, INV-02）
- **Given**: 必要な Context プロバイダ（`ThemeContext`, `AuthContext`, `ToastContext`, i18n）で wrap、`onClose/onSuccess/onLoginClick = vi.fn()`、`navigator.onLine = true`
- **When**: `const { container } = render(<PostForm ... />)` 後 `const results = await axe(container)`
- **Then**:
  - `expect(results).toHaveNoViolations()`
  - 特に violations に `label`, `form-field-multiple-labels` が含まれない
  - 全 `<input>` の `id` 属性が対応する `<label htmlFor>` と一致する（補助的に `within(container).getAllByLabelText(...)` で確認）

### TC-02: WeatherSelector は axe violations がゼロ（INV-01, INV-02）
- **Given**: `weatherManual=true`, `manualWeather='sunny'` 等の現実的 props
- **When**: render + axe
- **Then**: `toHaveNoViolations()`

### TC-03: AuthModal は axe violations がゼロ（INV-01）
- **Given**: `isOpen=true`, `mode='login'` / `mode='signup'` の 2 パターン（parametrized）
- **When**: render + axe
- **Then**: 両パターンで `toHaveNoViolations()`

### TC-04: EditDialog のボタン群はアクセシブル名を持つ（INV-03）
- **Given**: `post` フィクスチャ、`open=true`
- **When**: render + axe
- **Then**:
  - `toHaveNoViolations()`
  - `screen.getAllByRole('button')` 全員に `textContent` または `aria-label` が存在（非空）

### TC-05: AdminLayout は axe violations がゼロ（INV-01）
- **Given**: 子要素として簡易的な `<main>Content</main>` を渡す
- **When**: render + axe
- **Then**: `toHaveNoViolations()`

### TC-06: /post/[id] の DetailPageClient は axe violations がゼロ（INV-01）
- **Given**: `id='1'`、`useDetailPost` フックを `vi.mock` で固定 post を返すよう差し替え
- **When**: render + axe
- **Then**: `toHaveNoViolations()`
