## 背景

ザリダスにはパスワードを設定する経路が 2 つある。サインアップ（`src/components/modals/AuthModal.tsx`）と、パスワードリセット後の新パスワード設定（`src/views/AuthCallbackPage.tsx` の recovery モード）である。この 2 経路で **要求されるパスワード強度が一致していない**。サインアップは「8 文字以上＋英字＋数字」を要求するのに対し、リセット経路は「6 文字以上」しか検証していない。

結果として、ユーザーは強いパスワードでサインアップしても、リセットフローを通せば「123456」のような弱いパスワードに変更でき、強度ポリシーが実質的に骨抜きになる。

## 現状の問題

（ファイルパス:行番号と現コードの実態）

- **リセット経路（弱い）** — `src/views/AuthCallbackPage.tsx:89-98`:
  ```ts
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    ...
  ```
  検証は `password.length < 6` のみ。英字・数字の要求が無く、**6 文字以上なら何でも通る**。
  - `src/views/AuthCallbackPage.tsx:159,162,177,180` — 入力欄も `placeholder="6文字以上"` / `minLength={6}` と 6 文字基準のまま。

- **サインアップ経路（強い）** — `src/components/modals/AuthModal.tsx:159-163`:
  ```ts
  // REQ-018A: Enforce minimum 8 chars, at least one letter and one number
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    setError(t('auth.errors.passwordRequirements'))
    return
  }
  ```
  「8 文字以上 ＋ 英字を含む ＋ 数字を含む」を要求。
  - `src/components/modals/AuthModal.tsx:367-385` — `minLength={8}`、および入力中に `8文字以上 / 英字を含む / 数字を含む` の達成チェックリストを表示。
  - `src/components/modals/AuthModal.tsx:400` — 確認用パスワード欄も `minLength={8}`。

- **不整合の核心**: 同一アプリ内で「新パスワードを設定する」という同じ意味の操作に対し、リセット経路（`AuthCallbackPage.tsx:91`）が `< 6`、サインアップ経路（`AuthModal.tsx:160`）が `< 8 || 英字なし || 数字なし` と、別々のロジックがハードコードされている。バリデーションが共通化されていないため、片方を直しても他方に反映されない。
