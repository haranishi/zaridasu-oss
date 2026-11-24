# REQ-152: パスワードリセット強度の不整合

## これは何か

パスワードを設定する 2 経路（サインアップ / リセット後の新パスワード設定）で強度要件が
食い違っている問題を、共通バリデーション関数への集約で解消する要件。詳細は
`REQ-152-password-reset-strength/` 配下に分割している。

## 目的・背景（要約）

サインアップは「8 文字以上＋英字＋数字」を要求するのに対し、**リセット経路は「6 文字以上」しか
検証していない**。そのためユーザーは強いパスワードで登録しても、リセットフローを通せば
「123456」のような弱いパスワードに変更でき、強度ポリシーが実質的に骨抜きになる。
不整合の核心は、同じ意味の操作に別々のロジックがハードコードされていることにある。

## 主要な決定事項（要点）

- **ポリシーは現行サインアップ基準に統一**: 8 文字以上 ＋ 英字 1 文字以上 ＋ 数字 1 文字以上。
- **単一の共通関数に集約**（例 `src/lib/validation/password.ts` の `validatePasswordStrength`）し、
  将来ポリシーを変えても全経路に一括反映されるようにする。サインアップ側も挙動不変のまま置き換える。
- UI も揃える: recovery フォームの `placeholder="6文字以上"` / `minLength={6}` を 8 文字基準にし、
  サインアップにある達成チェックリスト相当の UI も提供することが望ましい。
- エラーメッセージはハードコード日本語をやめ、既存 i18n キー `auth.errors.passwordRequirements` を再利用する。
- **クライアント検証は UX 用**であり、最終的な強制は Supabase Auth 側の Password 設定で担保する
  （両者が矛盾しないことを確認する）。
- 確認パスワードの一致チェックは維持し、強度チェックと両方のエラーを適切に表示する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-152-password-reset-strength/01-background-and-problems.md) | 背景と現状の問題（両経路の実コード・行番号つきの対比と、不整合の核心） |
| [02-goals-and-requirements.md](REQ-152-password-reset-strength/02-goals-and-requirements.md) | 目的と機能要件 FR-152-01〜05、非機能要件 NFR-152-01〜02 |
| [03-acceptance.md](REQ-152-password-reset-strength/03-acceptance.md) | 受入条件 AC-152-01〜06（Given / When / Then 形式の境界値ケース） |
| [04-impact-and-priority.md](REQ-152-password-reset-strength/04-impact-and-priority.md) | 影響範囲（変更対象ファイル表・他機能への影響）と優先度の判断理由 |
