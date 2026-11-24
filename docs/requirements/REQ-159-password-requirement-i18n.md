# REQ-159: パスワード要件チェックリストの i18n 漏れ

## 背景
ザリダスは `react-i18next` を用いて日本語 (ja)・英語 (en)・韓国語 (ko)・中国語 (zh) の 4 言語に対応している。翻訳リソースは `src/locales/{ja,en,ko,zh}/translation.json` に単一ネームスペース `translation.json` として格納され、`src/components/modals/AuthModal.tsx` 内のラベル・プレースホルダ・エラーメッセージは原則 `useTranslation()` の `t()` 経由で表示される（`AuthModal.tsx:5` で import、`AuthModal.tsx:27` で `const { t } = useTranslation()`）。

言語間のキー欠落を検出する CI スクリプト `scripts/check-i18n-parity.ts`（npm script: `i18n:check`）が存在し、ja をベース言語として en/ko/zh とのフラット化キー差分を比較し、差分があれば exit 1 で fail する。

## 現状の問題
新規登録 (signup) タブのパスワード入力欄の下に表示されるパスワード要件チェックリストが、日本語ハードコード文字列になっており `t()` を経由していない。

`src/components/modals/AuthModal.tsx:374-382`:
```tsx
{[
  { met: password.length >= 8, label: '8文字以上' },
  { met: /[a-zA-Z]/.test(password), label: '英字を含む' },
  { met: /[0-9]/.test(password), label: '数字を含む' },
].map((req) => (
  <p key={req.label} ...>
    <span>{req.met ? '✓' : '○'}</span>
    <span>{req.label}</span>
  </p>
))}
```

- `8文字以上` / `英字を含む` / `数字を含む` の 3 文字列が JSX に直書きされている。
- en/ko/zh 環境でもこの 3 項目だけが日本語で表示される（翻訳漏れ）。
- 同コンポーネントの他要素（`auth.password`、`auth.passwordMinLength`、`auth.passwordConfirm` 等）は `t()` 化済みであり、この 3 項目だけが例外的に未対応。
- これらの文字列は翻訳 JSON にキーが存在しないため `check-i18n-parity.ts` の検出対象外（JSON 上は欠落していないので fail しない）。t() キーとして切り出すことで初めてパリティチェックの保護対象に入る。
- 関連する `auth.errors.passwordRequirements`（`translation.json:290`）は 4 言語とも整備済みだが、チェックリスト 3 項目に対応する個別キーは ja を含めどの言語にも存在しない。

## 目的
パスワード要件チェックリストの 3 項目を `t()` 経由の翻訳キーに切り出し、en/ko/zh を含む全言語で正しく表示されるようにする。あわせて当該キーを `check-i18n-parity.ts` の保護下に置き、将来の言語追加・キー欠落を CI で検出できるようにする。

## 要件
### 機能要件
- [ ] FR-159-01: `src/components/modals/AuthModal.tsx:374-382` のチェックリスト 3 項目（`8文字以上` / `英字を含む` / `数字を含む`）のラベルをハードコードから `t()` 呼び出しに置き換える。
- [ ] FR-159-02: `src/locales/ja/translation.json` の `auth` セクションに 3 項目用のキー（例: `auth.passwordRules.minLength` / `auth.passwordRules.hasLetter` / `auth.passwordRules.hasNumber` 等のグループ化キー）を追加する。`map` の `key` 属性に label を使っている現状を踏まえ、各項目を一意に識別できる安定キーを併せて設計する。
- [ ] FR-159-03: 同一構造のキーを `src/locales/en/translation.json`・`src/locales/ko/translation.json`・`src/locales/zh/translation.json` の `auth` セクションに、それぞれ自然な訳語で追加する。en="8+ characters" 等、既存の `passwordMinLength` 表記（en="8+ chars (letters + numbers)" 等）とトーンを揃える。
- [ ] FR-159-04: 判定ロジック（`password.length >= 8` / `/[a-zA-Z]/` / `/[0-9]/`）は変更せず、表示文言のみ翻訳化する。

### 非機能要件（該当する場合）
- [ ] NFR-159-01: `npm run i18n:check`（`scripts/check-i18n-parity.ts`）が 4 言語すべてで新規キーを検出し、差分ゼロで exit 0 となること。
- [ ] NFR-159-02: チェック項目の表示順（8文字以上 → 英字 → 数字）と ✓/○ アイコンの挙動を現状から変えないこと。

## 受入条件
- [ ] AC-01: 言語を en / ko / zh に切り替えて signup タブでパスワードを入力したとき、チェックリスト 3 項目が当該言語で表示される。
- [ ] AC-02: `src/components/modals/AuthModal.tsx` 内に `8文字以上` / `英字を含む` / `数字を含む` の日本語ハードコード文字列が存在しない。
- [ ] AC-03: `npm run i18n:check` が exit 0 で通過する（ja/en/ko/zh のキーセットが一致）。
- [ ] AC-04: ja 環境での表示文言・表示順・✓/○ 挙動が改修前と同一である。
- [ ] AC-05: ビルド（`next build`）が成功し、型エラーが出ない。

## 影響範囲
- `src/components/modals/AuthModal.tsx`（signup タブのパスワード要件表示部 374-382 行）
- `src/locales/ja/translation.json`（`auth` セクション）
- `src/locales/en/translation.json`（`auth` セクション）
- `src/locales/ko/translation.json`（`auth` セクション）
- `src/locales/zh/translation.json`（`auth` セクション）
- `scripts/check-i18n-parity.ts` による CI 検証（キー追加後に通過確認）

## 優先度
- **緊急度**: 低 / **重要度**: 中 / **理由**: 機能不全ではなく多言語ユーザー向けの UI 品質・一貫性の問題。en/ko/zh ユーザーがサインアップ時にパスワード要件だけ日本語で見える体験はローカライズ品質を損なうが、登録自体は阻害されない。改修は局所的で低リスク。
