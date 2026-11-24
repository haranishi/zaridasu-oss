## 3. 回帰防止（FR-214-02 / 03）

サーバー側 getSession 認可利用の混入を、**lint と CI スクリプトの 2 重**で防ぐ（多層）。

### 3-1. ESLint（`eslint.config.js`）

- TS/TSX 全体に `no-restricted-syntax` を追加。AST セレクタ
  `CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']`
  で `*.auth.getSession()` 呼び出しのみを **error** にする。
- `getSessionCache()` / `getUserMedia()` / `auth.admin.getUserById()` はセレクタ上マッチしない（誤検出なし）。
- 例外: `src/context/AuthContext.tsx`（クライアント表示用の唯一の正規利用）と
  `src/**/__tests__/**` は override でルール off。

### 3-2. `auth-route:check`（`scripts/check-no-auth-route.mjs`）

既存の `/auth` 直接遷移検出を維持しつつ、不変条件 2 として
「サーバー側 `*.auth.getSession(` 認可利用の検出」を追加。

- 対象: `src/**`（`'use client'` ディレクティブを持つファイルとテストは除外）＋ `supabase/functions/**`。
- `'use client'` 判定はファイル冒頭ディレクティブを正規表現で解析（lint の glob 除外より網羅的）。
- 既存の `/auth` 検出と統合し、CI（`.github/workflows/ci.yml` lint ジョブの `npm run auth-route:check`）で
  既にゲートに乗る（追加配線不要）。

検出例（試験的に server で `supabase.auth.getSession()` を書くと）:
- ESLint: `npm run lint` が `no-restricted-syntax` で fail。
- スクリプト: `npm run auth-route:check` が exit 1。

---
