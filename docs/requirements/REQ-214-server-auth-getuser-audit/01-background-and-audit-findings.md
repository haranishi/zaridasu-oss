## 背景

ザリダス（Next.js 15 App Router / Supabase SSR / TypeScript）の認可は、Obsidian ノート **09_Supabase_Security**・**12_Auth_Flows_Implementation**・**26_Supabase_Authorization_Testing** の知見を下敷きにしている。要点は以下の 4 つ。

1. **SSR では認可判断に `getSession()` を使わない。** `getSession()` は Cookie/ローカルストレージのセッションをそのまま返し、サーバー側で Cookie を再検証しない。よって Cookie を偽装されると `getSession()` の戻り値も偽装され得る。サーバーでは `getUser()`（Auth サーバーへ問い合わせて検証）または `getClaims()`（JWT 署名検証）で検証してから認可する。
2. **認可は「データ層」で多層に持つ。** middleware は UX 上のリダイレクト（楽観的チェック）に過ぎず、本当の認可は DAL / Server 処理 / Route Handler / DB ポリシー（RLS・SECURITY DEFINER RPC）の各層で行う。middleware だけに依存しない。
3. **Next.js middleware の認可バイパス（CVE-2025-29927）。** 修正版は 15.2.3 以降。middleware を唯一の関門にしている場合に影響が大きい。
4. **JWT freshness。** `app_metadata.role` 等の JWT 内クレームは、トークン更新まで古い値が残る場合がある。権限剥奪・アカウント削除・管理者昇格などの高リスク操作は JWT のクレームだけで判断せず、DB 側の所属 / role を再確認する。

既知のとおり `src/middleware.ts` / `src/lib/supabase/middleware.ts` は既に `getUser()`（DB 検証）で /admin・/dashboard を保護しており、CI には `auth-route:check`（`scripts/check-no-auth-route.mjs`）というカスタムチェックが存在する。本 REQ は「middleware が getUser を使っているから安心」で終わらせず、**全経路（Server Components / Route Handler / Edge Functions / DB RPC）で getSession を認可に使っていないことを棚卸しで保証**し、**回帰防止を仕組み化**し、**高リスク操作の freshness 再確認**を要件化する。

> 監査の前提（実コード `grep -rn "getSession\|getUser\|getClaims" src supabase` ＋各ファイル確認の結果）: **現時点でサーバー側の認可に `getSession()` を使っている箇所は無い。**`getSession()` の実使用はクライアントの `src/context/AuthContext.tsx:35` とテストのみ。すなわちコードは概ね健全であり、本 REQ の主眼は「現状の健全性を回帰させない仕組み（lint / `auth-route:check` 拡張）」と「freshness の明文化・テスト」「誤解を生むコメントの是正」に置く。新しい脆弱性の修正ではなく、**既存の良い状態の固定化（regression guard）**である。

## 現状の問題

（ファイルパス:行番号つき。多くは「健全だが保証/明文化されていない」項目）

### 1. サーバー側の getSession 認可利用を機械的に禁止する仕組みが無い（回帰防止の欠落）
- 現状、サーバー側コードで `getSession()` を認可に使っている箇所は無い（監査結果）。しかしそれを**保証する仕組みが存在しない**。
- ESLint はフラット config（`eslint.config.mjs`）で、`getSession()` のサーバー利用を禁じる `no-restricted-syntax` / `no-restricted-properties` 等のカスタムルールは**無い**（`grep "no-restricted" eslint.config.mjs` が 0 件）。
- CI のカスタムチェック `scripts/check-no-auth-route.mjs`（`package.json` の `"auth-route:check": "node scripts/check-no-auth-route.mjs"`、CI は `.github/workflows/ci.yml:28`）は、現状**`/auth` への直接遷移リンクの検出専用**（`forbiddenPatterns` は `router.push('/auth')` / `href="/auth"` / `'/auth'` の 3 つ、`check-no-auth-route.mjs:7-11`）であり、`getSession()` の認可利用は**一切検査していない**。
- 結果、将来 Server Component / Route Handler / Server Action で誤って `const { data: { session } } = await supabase.auth.getSession()` を書き、その `session.user` で分岐しても、lint も CI も検出しない。CVE-2025-29927 の教訓（middleware を信用しすぎない）と合わせ、SC/Route 層での getSession 認可は静かに混入し得る。

### 2. middleware に「それ以外は getSession() で高速判定」という実態と食い違うコメントが残る
- `src/lib/supabase/middleware.ts:40` のコメント:
  ```
  // FR-004: 管理者ルートはgetUser()でDB検証、それ以外はgetSession()で高速判定
  ```
  と書かれているが、**実コードは getSession を一切呼んでいない**。/admin は `getUser()`（:42）、/dashboard は `getUser()`（:55）で検証し、それ以外の path は（そもそも `src/middleware.ts:9-12` の matcher が `/dashboard/:path*` と `/admin/:path*` のみなので）認可判定自体を行わず素通りする。
- このコメントは「middleware で getSession による認可をしている」という**誤った設計理解を生む**。実装は正しい（getUser のみ）が、ドキュメントが SSR の禁忌（getSession 認可）を是としているように読め、模倣リスクがある。コメントの是正が必要。

### 3. 高リスク操作の freshness は DB 側で担保されているが、明文化・テストが薄い
- 管理者昇格 / 剥奪 RPC `public.set_user_admin_role`（`supabase/schema.sql:484-516`）は、呼び出し元の role を**JWT クレームではなく `auth.users.raw_app_meta_data` から都度 SELECT して**検証している（`schema.sql:494-499`）:
  ```sql
  SELECT raw_app_meta_data->>'role' INTO caller_role FROM auth.users WHERE id = auth.uid();
  IF caller_role != 'admin' THEN RAISE EXCEPTION '管理者権限が必要です'; END IF;
  ```
  これは freshness 観点で**正しい**（直前に admin を剥奪された旧 JWT 保持者は、JWT に `role=admin` が残っていても DB 側 SELECT で弾かれる）。さらに自己昇格/自己剥奪も禁止している（`schema.sql:502-504`）。
- 一方、Edge Function の admin 判定（例 `health-gemini/index.ts:144-152`、`analyze-image/index.ts:652-658`）は `getUser(token)` で得た **`user.app_metadata.role`（＝JWT 由来クレーム）**で admin を判定している。getUser 自体はトークンを Auth サーバーで検証するため「正規の本人」であることは担保されるが、`app_metadata.role` 値は**最後のトークン更新時点のスナップショット**であり、剥奪直後の旧トークンでは古い `admin` が残り得る（freshness ギャップ）。
  - ただし対象 Edge Function は health チェック / 自分の投稿の再分析という**低リスク操作**であり、admin 剥奪直後の数分間に旧トークンで叩けても被害は限定的（情報露出 / レート増程度）。**現状は許容できる**が、「どの操作で JWT クレーム判定を許し、どの操作で DB 再確認を要求するか」の方針が明文化されていない。
- 監査テスト基盤（Obsidian 26 が下敷き）の pgTAP では、`set_user_admin_role` の freshness（旧 admin が剥奪後に昇格できない）を直接検証するケースの有無が未確認で、回帰時に気づけない可能性がある。

### 4. 監査結果として「健全」な事実（＝現状の正確な評価。問題ではないが保証対象として記録）
以下はいずれも **getSession 非依存で正しく実装されている**。本 REQ の回帰防止・テストの保護対象として明記する。
- **middleware**: `getUser()` のみで /admin・/dashboard を DB 検証（`middleware.ts:42,55`）。fail-closed（例外時はログインへリダイレクト、`middleware.ts:64-87`）も実装済み。
- **Server Components**: `src/lib/supabase/server.ts` の `createClient()`（`createServerClient`）factory は getUser/getSession を**含まず**、SC ページ（`app/post/[id]/page.tsx`・`app/area/**`・`app/profile/[userId]/page.tsx`・`app/request/[id]/page.tsx` 等）は**RLS に依拠**してデータ取得する（SC 層で getSession による認可分岐をしていない）。admin 画面（`app/admin/layout.tsx` → `AdminLayoutClient`、各 `app/admin/**/page.tsx`）はクライアント側描画で、認可の実体は **middleware（getUser）＋ DB（RLS / RPC）**にある（多層防御）。
- **Route Handler**: アプリ側の Route Handler は `src/app/api/og/route.tsx` のみで、**公開 OG 画像生成**のため認可不要（getSession 不使用）。
- **Edge Functions**: 呼び出し元検証はすべて `getUser(token)`（`analyze-image:652` / `analyze-audio:546` / `health-gemini:144` / `notify-comment:33`）。getSession は不使用。Webhook 駆動の関数（`notify-post-status` / `notify-survey-request` / `notify-comment` の本文取得等）は `_shared/webhookAuth.ts` の共有シークレット＋ service_role で動作。`supabase/config.toml` に `[functions.*] verify_jwt` の上書きは無く（`grep` で 0 件）、関数はプラットフォーム既定（`verify_jwt = true`）で JWT 必須。
- **クライアント**: `src/context/AuthContext.tsx:35` の `getSession()` は **`'use client'` コンポーネントでの表示用**（`isAdmin` で UI 出し分け）。サーバー認可ではないため適正。`onAuthStateChange`（:43）併用で表示を更新。
- **CVE-2025-29927**: `next` の導入版は **15.5.14**（`node_modules/next/package.json` および `package-lock.json` の `node_modules/next` version）。修正版 **15.2.3 以降**であり、middleware 認可バイパスの既知 CVE には**該当しない**。
