# REQ-216: セキュリティヘッダの補強（未設定項目の追加）

## 背景
ザリダス (Next.js 15 App Router / Vercel / Supabase) は `next.config.ts` の `async headers()`（`next.config.ts:38-94`）で全パスにセキュリティヘッダを付与している。実装済みは X-Frame-Options: DENY（:43）、X-Content-Type-Options: nosniff（:44）、Referrer-Policy: strict-origin-when-cross-origin（:45）、Permissions-Policy（:47）、X-XSS-Protection（:48）、HSTS（:49）、CSP（:50-78）で、緩和層としては概ね整っている。

一方、Obsidian ノート `02_notes/Security_Research/10_Web_App_Security_Practical.md`（モダンスタック固有のセキュリティ実践メモ）の「5. セキュリティヘッダ & CSP」「6. CORS」「チェックリスト」を下敷きに現状を突き合わせると、同ノートが推奨しているのに**未設定の補強ヘッダ**がいくつか残っている。具体的には (1) `X-Powered-By` のバージョン暴露ヘッダが消されていない、(2) Cross-Origin 分離系（COOP / CORP / COEP）が一切無い、(3) Permissions-Policy が camera/microphone の 2 機能しか宣言しておらず geolocation/payment/usb 等が未制御、(4) 唯一の Next.js API Route（`src/app/api/og/route.tsx`）に CORS の明示が無い、の 4 点。

本 REQ は「既に実装済みのヘッダは変更せず、未設定の補強ヘッダだけを足す」小粒な堅牢化として整理する。実害（既知の攻撃経路）は限定的だが、OWASP Secure Headers / 上記ノートのチェックリストを満たし、防御の緩和層を厚くする目的で扱う。

> 重複回避の注記: CSP の `'unsafe-inline'`（`next.config.ts:64,66`）を残す判断は **REQ-116（`docs/requirements/REQ-116-csp-unsafe-inline-decision.md`）で「無期限保留」として記録済み**であり、本 REQ の対象外。nonce 化や `'unsafe-inline'` 除去は本 REQ では扱わない。CSP そのものの内容（script-src / connect-src 等）も既存維持とし、追加するのは CSP 以外のヘッダ群に限る。
>
> 実装時の注意: COOP/COEP/CORP は地図タイル・外部スクリプト・クロスオリジン画像の読み込み挙動を変え得るため、**`next build` 後にローカル / preview で地図（OSM タイル）・GTM・OG 画像・Supabase 画像が壊れていないか必ず実機確認**してから採用すること。影響が出る COEP は任意（段階導入）扱いとする。

## 現状の問題
（ファイルパス:行番号つき）

### 1. `X-Powered-By` が消されておらず、フレームワークを暴露している
- `next.config.ts` の `NextConfig` に `poweredByHeader: false` の指定が**無い**（`next.config.ts:12-95` の設定オブジェクト全体に該当キーが存在しないことを確認）。Next.js のデフォルトは `poweredByHeader: true` のため、本番レスポンスに `X-Powered-By: Next.js` が付与され、使用フレームワークが外部に分かる状態。
- Obsidian ノートは「情報漏れになるヘッダは消す（`X-Powered-By` は `poweredByHeader: false` で無効化）」（`10_Web_App_Security_Practical.md:105,220`）、アンチパターン「`X-Powered-By` などのバージョン暴露ヘッダを放置する」（同 :157）、チェックリスト「`X-Powered-By` を消している」（同 :244）と明記しており、現状はこれを満たしていない。
- 直接的な脆弱性ではなく**情報露出（fingerprinting 容易化）**の問題。対処コストはほぼゼロ。

### 2. Cross-Origin 分離系ヘッダ（COOP / CORP / COEP）が未設定
- `next.config.ts:42-78` の共通ヘッダ配列に `Cross-Origin-Opener-Policy`（COOP）/ `Cross-Origin-Resource-Policy`（CORP）/ `Cross-Origin-Embedder-Policy`（COEP）が**いずれも無い**（`grep -rn "Cross-Origin" --include=*.ts` で Next.js 側の設定ファイルにヒット無し。ヒットするのは `supabase/functions/*` の Edge Functions のみで、これは別ホスト・別ランタイムのため本 REQ の対象外）。
- `src/middleware.ts` / `src/lib/supabase/middleware.ts` でもセキュリティヘッダの付与は行っておらず（前者は `updateSession` を呼ぶだけ・`middleware.ts:4-6`、後者は Cookie 設定と認可リダイレクトのみ・`supabase/middleware.ts` 全体）、ヘッダ付与は `next.config.ts` に一元化されている。
- COOP 不在により、`window.open` / `window.opener` 経由のクロスオリジン参照分離（cross-origin isolation の第一歩・Spectre 系緩和や tab-nabbing 緩和）が効いていない。CORP 不在により、自サイトの静的レスポンス（OG 画像等）が他オリジンから無制限に埋め込まれ得る。
- ただし COEP を有効化すると、CORP/CORS ヘッダを返さないクロスオリジン下位リソースが**全てブロック**される。ザリダスは以下のクロスオリジンリソースを読み込んでおり、影響評価が必須:
  - OpenStreetMap タイル `https://{s}.tile.openstreetmap.org/...`（`src/lib/constants.ts:29` ほか `MiniMap.tsx:35` / `MapModal.tsx:26` / `LocationSection.tsx:104` / `ReviewCardMiniMap.tsx:50` / `SurveyRequestForm.tsx:112` / `DetailPage.tsx:23`）
  - GTM スクリプト `https://www.googletagmanager.com/gtm.js`（`src/app/layout.tsx:65-77`）
  - Supabase Storage 画像（`next.config.ts:15-28` の remotePatterns、`img-src ... https://*.supabase.co` 相当）
  - Leaflet の unpkg 由来スタイル（CSP `style-src ... https://unpkg.com`・`next.config.ts:66`）
  これらは COEP `require-corp` 下では CORP/`crossorigin` 属性が必要になり、OSM タイルや GTM は外部依存のため壊れる可能性が高い。よって COEP は段階導入（任意）とすべき。

### 3. Permissions-Policy が camera/microphone のみで、他の機能を制御していない
- 現状は `Permissions-Policy: camera=(), microphone=(self)`（`next.config.ts:47`）の 2 機能だけ。Obsidian ノートは「使わない機能は `camera=(), geolocation=(), microphone=()` 等で無効化」（`10_Web_App_Security_Practical.md:103,216`）を推奨しており、`geolocation` / `payment` / `usb` などが**未宣言（＝ブラウザ既定のまま許可方向）**になっている。
- ただし geolocation は**無効化できない**。ザリダスは位置情報を扱う PF で、投稿フォームが `navigator.geolocation.getCurrentPosition` を呼ぶ（`src/components/features/posts/PostForm.tsx:147-148`）。`geolocation=()` にすると**現在地取得（投稿時の位置自動入力）が壊れる**ため、`geolocation=(self)` とする必要がある。
- payment / usb / 加速度センサー等、ザリダスが使わない機能は明示的に `()`（無効）にできる。これは「未使用機能のアタックサーフェス縮小」であり実害は小さいが、ノートのチェックリスト充足としては妥当。

### 4. 唯一の API Route に CORS の明示が無い
- `src/app/api/og/route.tsx` は Edge Runtime の公開 GET（`route.tsx:5,25-101`）で、OG 画像（`ImageResponse`）を返す。レスポンスヘッダは `Cache-Control` のみ（`route.tsx:96-98`）で、`Access-Control-Allow-Origin` 等の CORS ヘッダは**付与していない**。
- 現状この Route は `<img>` / OGP のクロスオリジン GET で消費されるだけで、ブラウザの fetch + クレデンシャル付き CORS 経路では使われていないため、**CORS 未設定でも今は実害は無い**（むしろワイルドカード `*` を足す方が危険）。Obsidian ノートも「同一オリジンで完結する設計なら CORS を開けない（一番安全）」「`Access-Control-Allow-Origin: *`（ワイルドカード）は本番で使わない」（`10_Web_App_Security_Practical.md:115,117,152`）としている。
- よって本項目は「**ワイルドカード CORS を足さないことの確認**」と「将来 `/api/*` を外部 fetch 公開する場合は許可オリジン明示リストにする」という方針記録が主目的であり、新規ヘッダ追加は原則不要（= ガードレールとしての明文化）。

## 目的
- フレームワーク暴露ヘッダ（`X-Powered-By`）を消し、fingerprinting を減らす。
- Cross-Origin 分離の緩和層を、地図・外部スクリプトを壊さない範囲で段階的に足す（COOP + CORP を先に、COEP は影響評価の上で任意）。
- Permissions-Policy を、ザリダスの実機能（位置情報は維持）に合わせて未使用機能のみ明示無効化し、アタックサーフェスを縮小する。
- API Route の CORS をワイルドカードにしない方針を明文化し、将来の外部公開時の安全な開け方を残す。
- 既存ヘッダ（実装済み）と CSP の判断（REQ-116）は**変更しない**。

## 要件
### 機能要件
- [ ] FR-216-01: `next.config.ts` の `NextConfig` に `poweredByHeader: false` を追加し、本番レスポンスから `X-Powered-By` を除去する。`headers()` には手を入れず、設定オブジェクトのトップレベルにキーを足す。
- [ ] FR-216-02: `next.config.ts:42-78` の共通ヘッダ配列（`source: '/(.*)'`）に **COOP と CORP を追加**する。既存ヘッダ（X-Frame-Options〜CSP）は順序・値ともそのまま維持する。
  - `Cross-Origin-Opener-Policy: same-origin`（GTM 等が `window.opener` を必要としないことを確認の上。問題があれば `same-origin-allow-popups` にフォールバック可とする）
  - `Cross-Origin-Resource-Policy: same-site`（自サイトリソースの無制限な他オリジン埋め込みを抑止。OG 画像を他ドメインから正規に埋め込む要件があれば値を再検討）
- [ ] FR-216-03: `next.config.ts:47` の Permissions-Policy を、**既存の camera/microphone 宣言を保ったまま**未使用機能の明示無効化で拡充する。位置情報は機能維持のため `geolocation=(self)` とする。例: `camera=(), microphone=(self), geolocation=(self), payment=(), usb=()`（必要に応じ `accelerometer=()` 等を追加検討）。`microphone=(self)` の意図（REQ-081）は壊さないこと。
- [ ] FR-216-04: COEP（`Cross-Origin-Embedder-Policy`）は**本 REQ では既定で追加しない**。追加検討する場合は、OSM タイル・GTM・Supabase 画像・unpkg スタイル（「現状の問題」2 に列挙）が `require-corp` 下で読めるかを実機確認し、壊れるものが無い（または `crossorigin` 属性 / 代替で解消できる）ことを確認できた場合のみ別途有効化する。本要件では「COEP 未追加で COOP+CORP のみ」を完了条件とし、COEP は将来の任意項目として影響評価メモを残す。
- [ ] FR-216-05: `src/app/api/og/route.tsx` に **ワイルドカード CORS（`Access-Control-Allow-Origin: *`）を追加しない**ことを確認・記録する。現状の同一オリジン完結方針を維持し、将来 `/api/*` を外部オリジンの fetch から使わせる必要が出た場合は「許可オリジンの明示リストに対し、リクエスト Origin が一致する時だけ反映する」方式にする旨をコメント / 本 REQ に残す（新規ヘッダ追加は原則不要）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-216-01: 本 REQ は**未設定ヘッダの追加のみ**。既存実装済みヘッダ（X-Frame-Options / X-Content-Type-Options / Referrer-Policy / X-XSS-Protection / HSTS / CSP）の値・有無は一切変更しない。CSP の `'unsafe-inline'` は REQ-116 の判断を踏襲し触らない。
- [ ] NFR-216-02: 追加ヘッダによって既存機能が回帰しないこと。特に (a) 地図（OSM タイル）描画、(b) GTM 計測、(c) OG 画像生成（`/api/og`）、(d) Supabase Storage 画像表示、(e) 投稿フォームの現在地取得（geolocation）が `next build` 後の本番相当ビルドで正常動作すること。
- [ ] NFR-216-03: 全ページが HTTPS で配信されること（Vercel は自動 HTTPS + 既存 HSTS（`next.config.ts:49`）で担保。混在コンテンツ（http:// の埋め込み）が無いことを併せて確認）。
- [ ] NFR-216-04: `tsc --noEmit` / lint / `next build` が成功すること。

## 受入条件
- [ ] AC-01: 本番相当ビルドのレスポンスヘッダに `X-Powered-By` が**含まれない**（`curl -I` 等で確認）。
- [ ] AC-02: 全ページのレスポンスに `Cross-Origin-Opener-Policy`（same-origin 系）と `Cross-Origin-Resource-Policy`（same-site）が付与されている。
- [ ] AC-03: `Permissions-Policy` に `geolocation=(self)` が含まれ、投稿フォームの現在地取得（`PostForm.tsx:147-148`）が動作する。かつ未使用機能（例 payment / usb）が `()` で無効化されている。既存の `camera=()` / `microphone=(self)` が維持されている。
- [ ] AC-04: 地図（OSM タイル）・GTM・OG 画像・Supabase 画像が新ヘッダ追加後も正常に読み込まれる（COEP は未追加のため `require-corp` 由来のブロックが発生しない）。
- [ ] AC-05: `/api/og` のレスポンスに `Access-Control-Allow-Origin: *` が付いていない（ワイルドカード CORS 不在の確認）。
- [ ] AC-06: 既存ヘッダ（X-Frame-Options: DENY / nosniff / Referrer-Policy / HSTS / CSP）が従来どおり付与され、CSP の値が REQ-116 時点から変わっていない。
- [ ] AC-07: `tsc --noEmit` / lint / `next build` が成功する。

## 影響範囲
- `next.config.ts`（`poweredByHeader: false` 追加、`headers()` 共通配列に COOP/CORP 追加、Permissions-Policy 拡充）
- `src/app/api/og/route.tsx`（ワイルドカード CORS を入れないことの確認 / 方針コメント。原則コード変更なし）
- 動作確認の観点で影響を受け得る箇所（変更はしないが回帰確認対象）: 地図系コンポーネント（`MapView.tsx` / `MiniMap.tsx` / `MapModal.tsx` / `LocationSection.tsx` / `ReviewCardMiniMap.tsx` / `SurveyRequestForm.tsx` / `DetailPage.tsx`）、`src/app/layout.tsx`（GTM）、`src/components/features/posts/PostForm.tsx`（geolocation）
- 対象外: `supabase/functions/*`（別ホスト・別ランタイムの Edge Functions。CORS は当該ランタイム側の設計で本 REQ の Next.js ヘッダ補強とは独立）、CSP の `'unsafe-inline'`（REQ-116）

## 優先度
- **緊急度**: Low / **重要度**: Low〜Medium / **理由**: いずれも既知の攻撃経路を塞ぐものではなく、(1) はフレームワーク露出の低減、(2)(3) は緩和層（防御の多層化）の上積み、(4) は将来のための方針明文化。CSP・HSTS・X-Frame-Options 等の主要ヘッダは既に揃っており、本 REQ は OWASP Secure Headers / 社内ノートのチェックリストを満たすための小粒な堅牢化。`poweredByHeader` と Permissions-Policy 拡充・COOP/CORP 追加は数行・低リスクで対応でき、コスト対効果として整理する価値はある。COEP は影響大のため切り出し（任意）。
