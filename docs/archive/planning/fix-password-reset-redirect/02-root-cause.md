## 2. 根本原因分析

### 原因1: PKCE フローで `type=recovery` がURLに含まれない

`@supabase/supabase-js` v2.38+ はデフォルトで **PKCE（Proof Key for Code Exchange）フロー** を使用する。

**現在の `redirectTo` 設定（AuthModal.jsx:130）：**
```javascript
redirectTo: `${window.location.origin}/auth/callback`
```

**PKCEフローでのリダイレクトURL：**
```
https://zaridasu.vercel.app/auth/callback?code=xxxxx
```

→ `type=recovery` パラメータが **URLに含まれない**ため、`AuthCallbackPage` がリカバリーフローであることを検知できない。

### 原因2: イベントのレースコンディション

`AuthCallbackPage` は React の `lazy()` + `Suspense` で遅延読み込みされるため、以下の順序で処理が競合する：

1. `AuthProvider`（親）がマウント → `getSession()` でコード交換を開始
2. Supabase JS が `PASSWORD_RECOVERY` イベントを発火
3. `AuthCallbackPage`（子、遅延読み込み）がようやくマウント → `onAuthStateChange` リスナー登録
4. **`PASSWORD_RECOVERY` イベントは既に発火済み → 取り逃す**
5. `SIGNED_IN` イベントを受信 → `/dashboard` にリダイレクト
6. `/dashboard` が認証状態未確定で `/`（ホーム＝ログイン画面）にリダイレクト

### フローチャート（現在の不具合）
```
ユーザー → メールのリンクをクリック
  → Supabase サーバーがトークン検証
  → /auth/callback?code=xxx にリダイレクト
  → AuthProvider が code を処理（PASSWORD_RECOVERY イベント発火）
  → AuthCallbackPage がマウント（イベント取り逃し）
  → type=recovery が URL に無い → リカバリー検知失敗
  → SIGNED_IN で /dashboard → /（ホーム画面）にリダイレクト ❌
```

---
