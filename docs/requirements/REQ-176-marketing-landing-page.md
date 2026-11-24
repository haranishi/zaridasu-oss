# REQ-176: マーケティングLP（ランディングページ）`/lp` 新設

これは何か: 広告・SNS・チラシから流入した初回訪問者の受け皿として、`/lp` にマーケティングLPを新設する要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

現状ルート `/` は地図アプリ本体（HomeShell → HomeInteractive）で、初訪問者はサービスの価値・目的・使い方を理解する前に操作画面へ放り込まれる。文脈を持たない訪問者の離脱を防ぐため、**価値訴求 → 信頼形成 → 行動喚起**の順に構成したLPを前段に置き、新規登録と地図閲覧のコンバージョンを最大化する。

## 主要な決定事項（要点）

- **CV目標**: 主CV＝新規会員登録（`lp_cta_signup` → `sign_up`）／副CV＝アプリ閲覧（`lp_cta_map`）。
- **ルート `/` は現状維持**（構成変更しない）。問い合わせフォーム・A/B運用・多言語LPはスコープ外（初期リリースは ja のみ）。
- **静的配信**。実績数値のみ ISR（`revalidate: 86400`）。Leaflet 等の重量チャンクはLPに載せない。
- **LP構成7セクション**: ヒーロー／課題共感／特徴カード×4／使い方3ステップ／実績・社会的証明／FAQ／最終CTA＋モバイル追従CTAバー。
- **主CTAの着地**は `/?auth=signup&from=lp`。HomeInteractive 側で AuthModal をサインアップモードで自動オープンし、クエリを `router.replace` で除去する（SC-176-02）。
- **RSC/Client 分割は逸脱を正式許容**（REQ-206 FR-206-10）。当初案の「FAQのみ client」ではなく `src/views/LandingPage.tsx` 全体を単一クライアントコンポーネントとして実装済み。JSON-LD・metadata は `src/app/lp/page.tsx`（RSC）が担当。
- **DB変更ゼロ**（新規テーブル・カラム・RLS変更なし、マイグレーションなし）。新規公開APIも作らない。
- 文言と運営主体表記は `docs/lp-copy.md` で確定済み（2026-06-04）。大学名・研究室名・「卒業研究」の語は出さない。

## 分割ファイル

- [01-overview.md](REQ-176-marketing-landing-page/01-overview.md) — 1. 要件概要（背景・目的、CV目標表、スコープ、対象外、前提条件・制約）
- [02-user-stories.md](REQ-176-marketing-landing-page/02-user-stories.md) — 2. ユーザーストーリー US-176-01〜04（受け入れ条件・優先度・見積もり）
- [03-functional-requirements.md](REQ-176-marketing-landing-page/03-functional-requirements.md) — 3. 機能要件 FR-176-01〜12（各セクション仕様、CTA導線、計測イベント一覧、RSC/Client方針の注記）
- [04-non-functional-requirements.md](REQ-176-marketing-landing-page/04-non-functional-requirements.md) — 4. 非機能要件 NFR-176-01〜17（性能・セキュリティ・i18n・a11y・レスポンシブ・SEO・ダークモード）
- [05-screens.md](REQ-176-marketing-landing-page/05-screens.md) — 5. 画面仕様 SC-176-01/02（レイアウト図、コンポーネント一覧の当初/実装対比、画面遷移、状態管理）
- [06-api-and-data-model.md](REQ-176-marketing-landing-page/06-api-and-data-model.md) — 6. API仕様 API-176-01/02 ＋ 7. データモデル・DB設計 ＋ 8. マイグレーション計画
- [07-implementation-plan.md](REQ-176-marketing-landing-page/07-implementation-plan.md) — 9. 実装計画（P1〜P3の作業表）とテスト方針
- [08-tbd-and-priority.md](REQ-176-marketing-landing-page/08-tbd-and-priority.md) — TBD・要確認事項（7件・うち4件は解決済み）と優先度
