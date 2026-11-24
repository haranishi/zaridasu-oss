## 目的

1. パスワード設定/変更のすべての経路で **同一の強度ポリシー（8 文字以上＋英字＋数字）** を適用し、リセット経路の抜け穴を塞ぐ。
2. パスワード強度バリデーションを **単一の共通関数に集約** し、将来ポリシーを変更しても全経路に一括反映されるようにする（DRY）。

## 要件

### 機能要件

- [ ] **FR-152-01: 共通バリデーション関数の作成**
  パスワード強度を検証する共通関数（例: `src/lib/validation/password.ts` の `validatePasswordStrength(password): { valid: boolean; messageKey?: string }`）を新設する。ポリシーは現行サインアップ基準に統一: **8 文字以上 ＋ 英字を 1 文字以上 ＋ 数字を 1 文字以上**。
- [ ] **FR-152-02: リセット経路への適用**
  `src/views/AuthCallbackPage.tsx:91` の `password.length < 6` 判定を、FR-152-01 の共通関数呼び出しに置き換える。エラーメッセージは i18n キー（`auth.errors.passwordRequirements` 相当）を使う。
- [ ] **FR-152-03: サインアップ経路の共通化**
  `src/components/modals/AuthModal.tsx:160` のインライン正規表現判定を、FR-152-01 の共通関数呼び出しに置き換える（挙動は不変、ロジックの一元化）。
- [ ] **FR-152-04: UI 表示の統一**
  `src/views/AuthCallbackPage.tsx` の recovery フォームの `placeholder="6文字以上"`（159 行）と `minLength={6}`（162,180 行）を `8文字以上` / `minLength={8}` に修正する。サインアップ（`AuthModal.tsx:372-385`）にある「8文字以上 / 英字を含む / 数字を含む」の達成チェックリストと同等の UI を recovery フォームにも提供することが望ましい。
- [ ] **FR-152-05: 確認パスワード一致チェックの維持**
  `AuthCallbackPage.tsx:95-98` の `password !== confirmPassword` チェックは維持する。順序は「強度チェック → 一致チェック」または併記とし、両方のエラーを適切に表示する。

### 非機能要件（該当する場合）

- [ ] **NFR-152-01: 多言語対応**
  エラーメッセージは i18n（`src/locales/*/translation.json`）の既存キー `auth.errors.passwordRequirements` を再利用し、ハードコードの日本語文字列（`AuthCallbackPage.tsx:92` の `'パスワードは6文字以上で入力してください'`）を置き換える。
- [ ] **NFR-152-02: サーバー側ポリシーとの整合**
  クライアント側バリデーションは UX 用であり、最終的なポリシー強制は Supabase Auth 側の Password 設定（最小長・必須文字種）で担保されることを確認・整合させる。クライアント検証はそれを先回りするものとして位置づける。
