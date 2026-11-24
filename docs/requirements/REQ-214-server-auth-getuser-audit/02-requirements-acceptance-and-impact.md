## 要件

### 機能要件

- [ ] FR-214-01: **全経路の getSession 認可利用の棚卸しを文書化する。** 本 REQ または `docs/` 配下に、`grep -rn "getSession\|getUser\|getClaims" src supabase` の各ヒットを「認可に使用 / 表示用（クライアント）/ テスト / 非該当」に分類した一覧を残す。少なくとも (a) サーバー側で getSession を認可に使う箇所が 0 件であること、(b) middleware・Edge Functions が getUser を使うこと、(c) `set_user_admin_role` が DB 再 SELECT で role 検証することを明記する。本 REQ の「現状の問題 §4」をその一次資料とする。
- [ ] FR-214-02: **`getSession()` のサーバー側認可利用を機械的に検出/禁止する仕組みを追加する。** 次のいずれか（または併用）を採る。実装方式は本 REQ 内で選択・記録する。
  - (a) **lint ルール（推奨の一案）**: `eslint.config.mjs` に、サーバー文脈ファイル（`src/app/**`（`'use client'` を除く）・`src/lib/supabase/server.ts`・`src/middleware.ts`・`src/lib/supabase/middleware.ts` など）を対象に `no-restricted-syntax` または `no-restricted-properties` で `supabase.auth.getSession` 呼び出し / `.auth.getSession` プロパティアクセスを **error** にするルールを追加する。`'use client'` ファイルと `__tests__`・`*.test.*` は除外する（クライアント表示用 getSession を壊さない）。
  - (b) **`auth-route:check` 拡張（推奨の一案・FR-214-03 と統合）**: `scripts/check-no-auth-route.mjs` を拡張し、サーバー側ファイルでの `getSession(` 認可利用を検出して `process.exit(1)` する。
  - いずれの方式でも、`src/context/AuthContext.tsx`（client）と Edge Functions のクライアント表示・テストを**誤検出しない**こと。
- [ ] FR-214-03: **既存 `auth-route:check`（`scripts/check-no-auth-route.mjs`）を「重複ではなく強化」として拡張する。** 現行の `/auth` 直接遷移検出（`check-no-auth-route.mjs:7-39`）は維持したまま、(i) サーバー側の `getSession` 認可利用検出（FR-214-02(b) を採る場合）、(ii) 検出対象に `supabase/functions/**` も含めて Edge Function での getSession 認可利用（現状 0 件）を将来も 0 件に保つ、を追加する。スクリプトの目的が「未ログイン導線 + サーバー認可の getSession 排除」に広がったことをスクリプト冒頭コメントと実行時メッセージに反映する。CI への追加配線は不要（`.github/workflows/ci.yml:28` で既に実行されるため、拡張だけで CI ゲートに乗る）。
- [ ] FR-214-04: **middleware のコメントを実態に合わせて是正する。** `src/lib/supabase/middleware.ts:40` の「それ以外はgetSession()で高速判定」を、実装（matcher は /admin・/dashboard のみ、いずれも `getUser()` で DB 検証、その他 path は middleware 認可対象外で素通り）と一致する記述に書き換える。getSession を認可に使う旨の記述を残さない。FR-004 への参照は維持する。
- [ ] FR-214-05: **高リスク操作の freshness 方針を明文化する。** 「権限昇格・剥奪・アカウント削除など高リスク操作は、JWT クレーム（`app_metadata.role`）だけで判断せず DB 側の role/所属を再確認する」を方針として `docs/`（本 REQ 影響範囲）に明記する。あわせて、`set_user_admin_role`（`schema.sql:494-499`）が既にこの方針に沿うこと、Edge Function の admin 判定（`health-gemini` / `analyze-image` reanalysis）は低リスクのため JWT クレーム判定を許容する旨を**意図として記録**する。
- [ ] FR-214-06: **DB 側 freshness の回帰テストを担保する。** `supabase/tests/` に、`set_user_admin_role` の freshness／自己操作禁止を検証する pgTAP を追加（または既存に追記）する。最低限 (a) admin を剥奪された呼び出し元（auth.uid() が示す行の role が admin でない）は昇格 RPC で EXCEPTION になる、(b) 非 admin は昇格できない、(c) 自分自身の昇格/剥奪は禁止される（`schema.sql:502-504`）、を Given/When/Then で確認する。既存 `rls_*.sql` の `_set_jwt` 等ヘルパー書式を踏襲する。

### 非機能要件（該当する場合のみ）

- [ ] NFR-214-01: FR-214-02 / FR-214-03 の検出ロジックは **false positive を出さない**こと。特に `getSessionCache`（`src/hooks/useWeather.ts:22,64`）・`navigator.mediaDevices.getUserMedia`（`AudioRecorder.tsx` 等）・`auth.admin.getUserById`（Edge Functions の管理者 API）・クライアントの `AuthContext.tsx` の getSession を**誤検出しない**（単語境界 / 文脈で `supabase.auth.getSession` の認可利用に限定する）。
- [ ] NFR-214-02: 追加する lint ルール / スクリプト拡張は既存 CI ジョブ（`.github/workflows/ci.yml:24-28` の lint / type-check / i18n / schema / auth-route）の実行時間を大きく増やさないこと。`auth-route:check` は既存の単一 walk を再利用する。
- [ ] NFR-214-03: 本 REQ はアプリの**振る舞いを変えない**こと（コメント是正・lint / スクリプト・テスト・ドキュメントのみ）。middleware / Edge Function / RPC の認可ロジックは変更しない。`npm run lint` / `npm run type-check` / `npm run auth-route:check` / pgTAP がすべて通ること。
- [ ] NFR-214-04: `next` のバージョンは CVE-2025-29927 修正版（15.2.3 以降）を維持すること。将来 15.2.3 未満へダウングレードしないよう、依存監査（REQ-210 と連携）でのチェック対象に含めることを推奨する（本 REQ では現状 15.5.14 で充足を確認済みと記録するに留める）。

## 受入条件

- [ ] AC-01: サーバー側ファイル（例 `src/app/**/page.tsx` の Server Component や `src/lib/supabase/server.ts`）に `const { data: { session } } = await supabase.auth.getSession()` を使った認可分岐を試験的に追加すると、`npm run lint`（FR-214-02(a) 採用時）または `npm run auth-route:check`（FR-214-02(b)/FR-214-03 採用時）が **fail する**。
- [ ] AC-02: クライアント（`src/context/AuthContext.tsx:35`）の getSession・`getSessionCache`（`useWeather.ts`）・`getUserMedia`・Edge Function の `auth.admin.getUserById` は、上記チェックで**検出されない**（false positive なし）。
- [ ] AC-03: `src/lib/supabase/middleware.ts:40` のコメントが実態（/admin・/dashboard を getUser で検証、その他は middleware 認可対象外）と一致し、getSession による認可を是とする記述が残っていない。
- [ ] AC-04: 全経路棚卸し（FR-214-01）の一覧が存在し、「サーバー側の getSession 認可利用 = 0 件」「`set_user_admin_role` は DB 再 SELECT で role 検証」「Edge Functions は getUser 検証」「`next` = 15.5.14（CVE 修正済み）」が記載されている。
- [ ] AC-05: pgTAP（FR-214-06）で、admin を剥奪された呼び出し元が `set_user_admin_role(..., true)` を呼ぶと EXCEPTION になり、非 admin・自己操作も拒否されることが確認でき、CI（rls-tests）が通る。
- [ ] AC-06: `auth-route:check` の拡張後も既存の `/auth` 直接遷移検出が機能し（`router.push('/auth')` を試験追加すると fail）、かつ本 REQ 変更後に `npm run lint` / `type-check` / `auth-route:check` / 既存 pgTAP・vitest がすべてグリーンであること。

## 影響範囲

**変更対象（ロジック非変更・ガード/明文化中心）:**
- `eslint.config.mjs`（FR-214-02(a) 採用時: getSession サーバー認可利用の `no-restricted-*` ルール）
- `scripts/check-no-auth-route.mjs`（FR-214-02(b)/FR-214-03: getSession 認可検出の追加、対象に `supabase/functions/**` 拡張、冒頭コメント・実行メッセージ更新）
- `src/lib/supabase/middleware.ts`（:40 のコメント是正のみ。コードは不変）
- `supabase/tests/`（FR-214-06: `set_user_admin_role` freshness の pgTAP 追加/追記）
- `docs/`（FR-214-01 棚卸し一覧・FR-214-05 freshness 方針。本 REQ 自体を一次資料化可）

**参照のみ（変更しない）:**
- `src/middleware.ts`・`src/lib/supabase/server.ts`・`src/lib/supabase/client.ts`・`src/context/AuthContext.tsx`
- `supabase/schema.sql`（`set_user_admin_role` 本体）・`supabase/functions/**`（getUser / webhookAuth）・`supabase/config.toml`
- `.github/workflows/ci.yml:24-28`（既存の lint / auth-route:check 配線。追加配線不要）

**他機能への影響:**
- 認可の振る舞いは不変（regression guard と明文化のみ）。
- REQ-210（依存監査）と連携し `next` の CVE 修正版維持を補強。CI 品質ゲート（REQ-180）の lint / auth-route:check ステップを強化。

## 優先度

- **緊急度**: Medium / **重要度**: Medium〜High
- **理由**: 監査の結果、**現時点でサーバー側の getSession 認可利用は無く、middleware は getUser、`next` は CVE 修正済み**であり、既知の実害は無い（コードは概ね健全）。したがって本 REQ は新規脆弱性の修正ではなく、**(1) その健全な状態を将来も保証する回帰防止（lint / auth-route:check 拡張）**、**(2) 誤解を招く middleware コメントの是正**、**(3) 高リスク操作の freshness 方針の明文化と DB 再確認の回帰テスト**に主眼を置く。getSession 認可の混入や middleware 過信（CVE-2025-29927 型）は一度起きると権限昇格に直結し得るため、低コストのガードとして優先的に固定化する価値が高い。
