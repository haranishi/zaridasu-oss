## 2. 棚卸し一覧（FR-214-01）

### 2-1. `getSession()` の実使用（= 認可禁止対象）

| ファイル:行 | 文脈 | 分類 | 判定 |
|---|---|---|---|
| `src/context/AuthContext.tsx:52` | `'use client'` コンポーネント。`isAdmin` の UI 出し分け（表示用） | 表示用（クライアント） | ✅ 適正（サーバー認可ではない） |
| `src/context/__tests__/AuthContext.test.tsx` | getSession のモック | テスト | ✅ 非対象 |
| `src/lib/supabase/__tests__/middleware.test.ts` | getSession のモック（呼ばれないことの検証含む） | テスト | ✅ 非対象 |

→ **サーバー側で `getSession()` を認可に使う箇所は 0 件。**

### 2-2. `getUser()` の使用（= 正しいサーバー検証）

| ファイル:行 | 用途 | 判定 |
|---|---|---|
| `src/lib/supabase/middleware.ts:42` | `/admin` ルートの DB 検証（user 不在→/admin/login、role≠admin→/） | ✅ 正しい |
| `src/lib/supabase/middleware.ts:55` | `/dashboard` ルートの DB 検証（user 不在→/） | ✅ 正しい |
| `supabase/functions/health-gemini/index.ts:144` | 呼び出し元検証→ `app_metadata.role==='admin'` で admin 判定（低リスク） | ✅ 正規本人は担保（freshness は §4 参照） |
| `supabase/functions/analyze-image/index.ts:652` | reanalysis の呼び出し元検証→ admin か own-post か判定（低リスク） | ✅ 同上 |
| `supabase/functions/analyze-audio/index.ts:546` | 呼び出し元検証 | ✅ 正しい |
| `supabase/functions/notify-comment/index.ts:35` | 呼び出し元検証（anon key + Authorization 伝播） | ✅ 正しい |

### 2-3. 誤検出しやすい語（= 認可と無関係。lint / auth-route:check が**検出してはいけない**）

| ファイル:行 | 語 | 内容 |
|---|---|---|
| `src/hooks/useWeather.ts:22,64` | `getSessionCache()` | sessionStorage キャッシュのローカル関数。`.auth.` 接頭辞なし |
| `src/components/features/posts/AudioRecorder.tsx:75,165` | `navigator.mediaDevices.getUserMedia` | マイク取得。認可と無関係 |
| `src/lib/audio/permission.ts` | `getUserMedia` | 同上 |
| `supabase/functions/_shared/mailer.ts:125` ほか notify-* | `supabase.auth.admin.getUserById(...)` | service_role の管理 API（メール宛先のメール取得）。`getUser` とは別物 |
| `supabase/functions/_shared/geocodeProvider.ts:58` | `getUserAgent()` | HTTP User-Agent 生成 |

### 2-4. Route Handler（アプリ側）

| ルート | 認可 | 判定 |
|---|---|---|
| `src/app/api/og/route.tsx` | 公開 OG 画像生成。認可不要 | ✅ getSession 不使用 |
| `src/app/dataset/zaridasu.geojson/route.ts` | 公開データセット配信。認可なし | ✅ getSession 不使用 |
| `src/app/dataset/zaridasu.csv/route.ts` | 公開データセット配信。認可なし | ✅ getSession 不使用 |

### 2-5. Server Components

`src/lib/supabase/server.ts` の `createClient()`（`createServerClient`）は getUser/getSession を
**含まない** factory。SC ページ（`app/post/[id]`・`app/area/**`・`app/profile/[userId]`・
`app/request/[id]` 等）は **RLS に依拠**してデータ取得し、SC 層で getSession による認可分岐を
していない。admin 画面はクライアント描画で、認可の実体は **middleware（getUser）＋ DB（RLS / RPC）**
にある（多層防御）。

### 2-6. Edge Functions のプラットフォーム設定

`supabase/config.toml` に `[functions.*] verify_jwt` の上書きは無く（grep 0 件）、関数は
プラットフォーム既定（`verify_jwt = true`）で JWT 必須。Webhook 駆動の関数
（notify-post-status / notify-survey-request / notify-comment の本文取得等）は
`_shared/webhookAuth.ts` の共有シークレット（`WEBHOOK_SECRET`）＋ service_role で動作。

### 2-7. 依存（CVE-2025-29927）

`next` 導入版 **15.5.14**（`require('next/package.json').version` で確認）。修正版 **15.2.3 以降**
であり middleware 認可バイパスの既知 CVE に該当しない。`@supabase/ssr` は 0.6.1。

---
