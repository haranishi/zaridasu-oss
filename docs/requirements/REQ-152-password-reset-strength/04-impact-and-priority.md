## 影響範囲

（変更対象ファイル一覧、他機能への影響）

| ファイル | 変更内容 |
|---|---|
| 新規 `src/lib/validation/password.ts` | 共通バリデーション関数 `validatePasswordStrength` |
| `src/views/AuthCallbackPage.tsx` | `password.length < 6`（91 行）→ 共通関数。`placeholder`/`minLength`（159,162,177,180 行）を 8 文字基準へ。i18n 化 |
| `src/components/modals/AuthModal.tsx` | インライン正規表現判定（160 行）→ 共通関数に置換（挙動不変） |
| `src/locales/*/translation.json` | 既存 `auth.errors.passwordRequirements` を recovery 経路でも利用（不足キーがあれば追加） |
| 新規 `src/lib/validation/__tests__/password.test.ts` | FR/AC の境界値ユニットテスト |

### 他機能への影響

- **REQ-018A（パスワード強度ポリシー）**: 本要件は REQ-018A で導入されたサインアップ強度ポリシーを、リセット経路にも展開し共通化するもの。`AuthModal.tsx:159` のコメント `REQ-018A` が起点。
- **Supabase Auth の Password 設定**: クライアント検証強化と Supabase 側の最小長設定が矛盾しないこと。
- **i18n**: 4 言語（ja/en/ko/zh）すべてに `passwordRequirements` 相当のメッセージが存在するか確認が必要。

## 優先度

- **緊急度**: Medium（即時のデータ漏洩には直結しないが、ユーザーが任意のタイミングで弱いパスワードに変更できる抜け穴）
- **重要度**: Medium（アカウント乗っ取り耐性に関わるが、影響は個々のユーザーアカウントに限定。admin 権限の昇格などには直結しない）
- **理由**: パスワード強度ポリシーが片方の経路だけ緩いのは典型的なバリデーション不整合で、攻撃者が弱いパスワードを設定する余地を残す。ただし実害はそのユーザー自身のアカウントに留まり、Supabase Auth 側の最小長設定でも一部緩和されうる。修正コストは低く（共通関数化＋数行の置換）、DRY 化による保守性向上の副次効果も大きいため、Medium 優先で着手すべき。
