# REQ-033: GTM sign_upイベント発火の正確性改善

## 背景
現在、Google OAuthコールバック(`/auth/callback`)で`sign_up`イベントが毎回発火しており、
新規登録と既存ユーザーのログインを区別できていない。
これにより、GA4の登録者数が実際より多くカウントされる。

## 要件

### 機能要件
1. `sign_up`イベントは**新規登録時のみ**発火すること
2. 既存ユーザーのログイン時は`login`イベントを発火すること
3. メール登録・Google OAuth両方で正しく区別できること

### 判定ロジック
- `session.user.created_at`と現在時刻を比較
- アカウント作成から60秒以内 → 新規登録（`sign_up`）
- アカウント作成から60秒超 → ログイン（`login`）

### 送信イベント仕様

| アクション | イベント名 | method |
|---|---|---|
| メール新規登録（確認完了） | `sign_up` | `email` |
| Google新規登録 | `sign_up` | `google` |
| Googleログイン（既存ユーザー） | `login` | `google` |
| メールログイン | `login` | `email` |

### 対象ファイル
- `src/views/AuthCallbackPage.tsx` - OAuth/メール確認コールバック
- `src/components/modals/AuthModal.tsx` - メールログイン

## 非機能要件
- 既存のコールバック処理フローに影響を与えないこと
