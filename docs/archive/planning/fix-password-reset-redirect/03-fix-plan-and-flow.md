## 3. 修正方針

### 修正1: `redirectTo` に `type=recovery` を明示的に付与

**ファイル:** `src/components/modals/AuthModal.jsx`

パスワードリセットメール送信時の `redirectTo` に `?type=recovery` クエリパラメータを追加する。
Supabase の PKCE フローはリダイレクトURL のクエリパラメータを保持するため、コールバック時に `type=recovery` が URL に残る。

```
リダイレクトURL: /auth/callback?type=recovery&code=xxxxx
```

これにより `AuthCallbackPage` の URL パラメータチェックで確実にリカバリーモードを検知できる。

### 修正2: `AuthCallbackPage` のイベントハンドリング強化

**ファイル:** `src/pages/AuthCallbackPage.jsx`

- `INITIAL_SESSION`（セッションあり）のケースを適切に処理
- セッションが既に確立されている場合のフォールバック処理を追加
- レースコンディションに依存しない堅牢な検知ロジックを実装

---

## 4. 修正後のフロー

```
ユーザー → メールのリンクをクリック
  → Supabase サーバーがトークン検証  
  → /auth/callback?type=recovery&code=xxx にリダイレクト
  → AuthCallbackPage がマウント
  → URL から type=recovery を検知 ✅
  → パスワード設定フォームを即座に表示 ✅
  → Supabase JS が code を交換してセッション確立（バックグラウンド）
  → ユーザーが新パスワードを入力 → updateUser({ password }) ✅
  → /dashboard にリダイレクト ✅
```

---
