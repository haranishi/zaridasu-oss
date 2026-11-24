# REQ-206: REQ-176（LP）の未完了項目・要件不整合の解消（完了管理）

## 背景

LP `/lp` は REQ-176 として実装・コミット前段階にある（`src/app/lp/` + `src/views/LandingPage.tsx` + `src/lib/lpAnalytics.ts`、2026-06-12 監査時点で未コミット）。中核（全セクション・CTA・計測・ISR実績・JSON-LD・i18n）は実装済みだが、REQ-176 の一部 FR/NFR が未着手で残り、また実装と要件記述の間に不整合がある。本REQは、それら**残作業の管理**と**REQ-176 本体への正式な追記・不整合解消**を1つにまとめる完了管理REQである（個別の独立課題は REQ-181/182/204/205 に分離済み）。

## 現状の問題

### (1) ヒーロービジュアル未実装（FR-176-02 / NFR-176-02 / NFR-176-03）
- ヒーローの実画像が無く、**プレースホルダー div のみ**: `src/views/LandingPage.tsx:271-277` は `role="img"` のグラデーション枠に `MapPin` アイコンを置いた仮表示（コメントも「画像は後日生成して差し替える」:270）。
- 連動して未着手:
  - **NFR-176-02**: LCP対象画像の `next/image` + `priority` + 適切な `sizes` 最適化（画像が無いため未適用）。
  - **NFR-176-03 / FR-176-02**: `public/lp/` ディレクトリ自体が存在しない（`ls public/lp` → No such file or directory）。`/optimize-media` プリセットでの軽量化対象も無し。
- `docs/lp-copy.md` ① は `[画像: 地図アプリ実画面のスクリーンショット（後日生成）]` と明示しており、素材生成が前提のTODO。

### (2) LP専用OGP画像 未作成（NFR-176-13）
- LP専用 `og-image-lp.png`（1200×630）が未作成（`public/og-image-lp.png` 不在。`public/og-image.png` のみ存在）。REQ-181（OGP/Twitter メタデータ）で暫定的に `/og-image.png` を流用する方針だが、**LP専用画像の作成自体は本REQの残作業**として管理する。

### (3) テスト一式が未実装（REQ-176 §9 テスト方針）
- REQ-176 §9 で定義した3種のテストが未実装:
  - **Vitest（単体）**: LpFaq の開閉と aria 属性 / LpStats の null フォールバック / CTAリンクの href・dataLayer 送出。→ `src/views/__tests__/` に `LandingPage` のテストが無い（既存は AuthCallbackPage / HomePage / TrendsPage のみ）。
  - **Playwright（E2E）**: `/lp` 表示 → 主CTA → `/` で AuthModal（signup）自動表示 → 閉じてクエリ除去 / 副CTA → `/`。→ `tests/e2e/` に LP スペックが無い（既存は admin/auth/home/post/smoke/survey-request 等）。
  - **バンドル検証**: `/lp` の First Load JS に leaflet チャンクが含まれないこと（NFR-176-01）。→ 該当テストが存在しない。
- ※テストの詳細設計（Given/When/Then・フィクスチャ）は本REQでは方針提示に留め、必要なら別途テスト要件（`gen-test-requirements`）で具体化する。

### (4) アプリ側からのLP導線 未実装（FR-176-12・任意）
- 未ログインユーザー向け SignupBanner からの `/lp` 導線（「ザリダスとは？」リンク）が未実装。REQ-176 上も優先度 低・任意。

### (5) 要件内部の矛盾（US-176-01 AC-2 vs SC-176-01）
- **US-176-01 AC-2**（`REQ-176:49`）: 「スクロール**1画面以内**に『誰が・何を・どうやって』が図解（3ステップ）で理解できる」。
- **SC-176-01 レイアウト定義**（`REQ-176:203-234`）: 3ステップ（使い方）は**4番目のセクション**（ヒーロー → 課題共感 → 特徴 → 使い方）。
- 実装は SC-176-01 のレイアウト定義に準拠（`src/views/LandingPage.tsx:44-53` の順序 = Hero → Marquee → Problem → Features → HowItWorks …）しており、3ステップは1画面以内には無い。**AC-2 とレイアウト定義が矛盾**。実コードがレイアウト定義を正としているため、AC-2 側の記述修正が必要。

### (6) RSC/Client 構成が REQ-176 規定から逸脱（NFR的記述 vs 実装）
- REQ-176 は SC-176-01 コンポーネント一覧（`REQ-176:235-247`）と FR-176-07（`:130`）で「**`'use client'` は FAQアコーディオンのみ**」「LpHeader/LpHero/LpProblem/LpFeatures/LpHowItWorks/LpStats/LpFinalCta は **RSC**」と規定。
- 実装は `src/views/LandingPage.tsx:1` が `'use client'` で、**LP全体が単一のクライアントコンポーネント**（全セクションが同ファイル内の関数として client 配下）。RSC 分割はされていない。
- 背景: 既存 `src/views/*` は全ページ client + `useTranslation` で、SSG時に ja 辞書の同期初期化により HTML 出力は正常化される流儀。LandingPage もその流儀を踏襲しており、SSR/SEO（JSON-LD・本文HTML）は機能している。よって**実害は限定的**だが、REQ-176 の明文規定からは逸脱している。
- 対応方針の決定が必要: (a) 逸脱を正式に許容する記録を REQ-176 に追記する、(b) 規定どおり RSC 化する。どちらかを要件として確定する。

## 目的

REQ-176 の未完了 FR/NFR を可視化・管理し、着手すべき残作業（ヒーロー画像・OGP画像・テスト・任意導線）を明文化する。あわせて REQ-176 本体の内部矛盾（AC-2）と RSC/Client 方針の逸脱を、追記または是正により解消し、要件と実装を一致させる。

## 要件

### 機能要件

- [ ] FR-206-01（ヒーロー画像）: ヒーローの実ビジュアル（地図アプリ実画面のスクショ等、`docs/lp-copy.md` ①）を用意し、`public/lp/` 配下に配置、`src/views/LandingPage.tsx:271-277` のプレースホルダーを実画像に差し替える。
- [ ] FR-206-02（LCP最適化）: ヒーロー画像を `next/image` + `priority` + 適切な `sizes` で実装する（NFR-176-02）。LCP < 2.5s（モバイル4G）を目標とする。
- [ ] FR-206-03（メディア軽量化）: 配置画像を `/optimize-media` プリセット（WebP優先）で軽量化し、`public/lp/` に最適化済みを置く（NFR-176-03）。
- [ ] FR-206-04（LP専用OGP画像）: `og-image-lp.png`（1200×630）を作成し `public/` に配置、REQ-181 の OGP/Twitter 画像参照を `/og-image.png` 暫定からこの専用画像に切り替える（NFR-176-13）。
- [ ] FR-206-05（Vitestテスト）: LpFaq（開閉・`aria-expanded`/`aria-controls`）、LpStats（`stats=null` 時カード非表示、REQ-205 連動で 0件時も）、CTA（`SIGNUP_HREF`/`MAP_HREF` の href・クリックで `pushLpEvent` 送出）の単体テストを追加する。
- [ ] FR-206-06（E2Eテスト）: `/lp` → 主CTA → `/` で AuthModal が signup タブで自動表示 → 閉じてクエリ（`auth`/`from`）除去、副CTA → `/` 遷移、の Playwright スペックを `tests/e2e/` に追加する。
- [ ] FR-206-07（バンドル検証）: `/lp` の First Load JS に leaflet チャンクが含まれないこと（NFR-176-01）を検証する仕組み（テスト or ビルド分析チェック）を追加する。
- [ ] FR-206-08（任意・SignupBanner導線）: 未ログイン向け SignupBanner に `/lp` への「ザリダスとは？」リンクを追加する（FR-176-12、優先度 低・任意。本REQでは任意項目として管理）。
- [ ] FR-206-09（REQ-176 追記: AC-2 矛盾解消）: REQ-176 の US-176-01 AC-2（`REQ-176:49`）を、SC-176-01 のレイアウト定義（3ステップは4番目）と整合する記述に修正する（例: 「スクロール初期領域で『誰が・何を』が伝わり、使い方3ステップはページ前半のセクションで図解される」等）。実コードを正とする。
- [ ] FR-206-10（REQ-176 追記: RSC/Client 方針の確定）: RSC/Client 構成の方針を決定し REQ-176 に追記する。(a) 採用 = 「既存 views 流儀（全 client + SSG時 ja 同期初期化で HTML 正常）に合わせ、LandingPage は全面 client を許容する」逸脱記録を FR-176-07 / SC-176-01 に追記、または (b) 採用 = RSC 化（FAQのみ client）に実装を是正。いずれかを確定する。

### 非機能要件

- [ ] NFR-206-01: 追加テストは既存の Vitest / Playwright 構成（`src/**/__tests__`、`tests/e2e/`）の規約に従う。
- [ ] NFR-206-02: ヒーロー/OGP画像の追加で CLS < 0.1（NFR-176-02）を悪化させない（`width`/`height` または `aspect-ratio` 指定）。

## 受入条件

- [ ] AC-01: `/lp` のヒーローに実画像が表示され、`next/image` で `priority` 指定され、`public/lp/` に最適化済みアセットが存在する。
- [ ] AC-02: Lighthouse/実測でヒーロー画像が LCP 要素となり、モバイルで LCP < 2.5s 目標を満たす（計測値を記録）。
- [ ] AC-03: `public/og-image-lp.png`（1200×630）が存在し、REQ-181 の OGP/Twitter 画像がこれを参照する（`/lp` ビルドHTMLの `og:image` が LP専用画像URL）。
- [ ] AC-04: LpFaq / LpStats / CTA の Vitest が追加され、`npm run test`（または相当）で通過する。LpStats は null/0件で数値カードを描画しないことを検証する。
- [ ] AC-05: `/lp` E2E（主CTA → AuthModal signup 自動表示 → クエリ除去、副CTA → `/`）が Playwright で通過する。
- [ ] AC-06: `/lp` の First Load JS に leaflet チャンクが含まれないことが検証で確認される（NFR-176-01）。
- [ ] AC-07: REQ-176 の US-176-01 AC-2 が SC-176-01 レイアウト定義と矛盾しない記述に更新されている。
- [ ] AC-08: REQ-176 に RSC/Client 方針（逸脱許容の記録 または RSC化）が明記され、実装と一致している。
- [ ] AC-09（任意）: SignupBanner に `/lp` 導線が追加されている（FR-206-08 を実施した場合）。

## 影響範囲

- `src/views/LandingPage.tsx`（ヒーロー画像差し替え、必要なら RSC 化）
- `public/lp/`（新規ディレクトリ・画像）、`public/og-image-lp.png`（新規）
- `src/views/__tests__/`（LandingPage 単体テスト新規）、`tests/e2e/`（LP E2E 新規）
- ビルド/バンドル検証の仕組み
- `src/components/**`（SignupBanner、任意）
- `docs/requirements/REQ-176-marketing-landing-page.md`（AC-2 修正・RSC方針追記）
- DB・RLS・API変更なし。

## 優先度

- **緊急度**: Medium / **重要度**: Medium
- **理由**: 機能は動作しているが、ヒーロー画像欠如（広告LPの訴求力）・テスト未整備（回帰リスク）・要件矛盾（AC-2 / RSC方針）が残る。OGP画像（FR-206-04）は REQ-181 と連動し共有体験に直結。いずれも公開品質・保守性に関わるが、致命的な機能不全ではないため Medium。DB変更なしで段階的に消化可能。
