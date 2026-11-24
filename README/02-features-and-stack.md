# 機能と技術：利用者の操作を何が支えるか

[READMEへ戻る](../README.md) · [画面ガイド](../docs/screens/README.md) · [コードの全体図](../docs/architecture/system-overview.md)

## 機能を利用の流れで見る

| 利用の場面 | アプリが扱うこと | 画面 |
|---|---|---|
| 見る | 地図・写真・条件検索・観察の詳細 | [地図](../docs/screens/map.md) |
| 記録する | 位置・日時・個体数・写真・音声・調査情報と、審査状態 | [投稿](../docs/screens/posting.md) |
| 協力する | 調査依頼、協力意思、コメント、依頼に結び付く結果 | [調査依頼](../docs/screens/collaboration.md) |
| 計画する | 非公開スポット、立寄り先、現地の不在確認・希少種 | [現地調査](../docs/screens/fieldwork.md) |
| 水辺を探す | 周辺水域、公開記録の集計、水域の情報提供 | [水域](../docs/screens/water.md) |
| 振り返る | 自分の履歴・未送信・バッジ・貢献・図鑑 | [マイページ](../docs/screens/personal.md) |
| 全体を知る | ランキング、推移、地域別ページ、CSV・GeoJSON | [集計とデータ](../docs/screens/explore-and-data.md) |
| 運営する | 審査、通報、監査、権限、非公開記録、AI費用、研究指標 | [管理画面](../docs/screens/admin.md) |

PWA、4言語、テーマ、共有、通知が利用を支えます。任意機能は設定・端末対応・貢献の進行に応じて表示が変わります。

## 技術と責任の対応

主要バージョンは確認時の [package.json](../package.json) に合わせています。導入する実際の依存は `package-lock.json` で再現します。

| 担うもの | 採用技術 |
|---|---|
| URL・サーバー表示・画面 | Next.js 16 App Router / React 19 / TypeScript 5 |
| 見た目・アイコン・翻訳 | Tailwind CSS 4 / Lucide React / i18next 26 |
| 地図の表示と操作 | Leaflet / React-Leaflet / heatmap / cluster |
| 水域の幾何計算 | JavaScript、Worker、Rust/Wasm |
| DB・認証・写真や音声の保存 | Supabase / PostgreSQL / Auth / Storage |
| AI・通知・地名付与 | Supabase Edge Functions / Gemini / Resend / Web Push等 |
| エラー・利用状況の計測 | Sentry 11 / GA4・GTM / web-vitals |
| テスト | Vitest 5 / Testing Library / Playwright / pgTAP / Rust tests |
| 品質・配備 | ESLint 10 / TypeScript / size-limit 14 / Lighthouse CI / GitHub Actions / Vercel |

画面はNext.js、権限や保存の規則はDBにも置きます。ブラウザからSupabaseへ直接アクセスする経路もあります。
技術を採用した理由と、担当する処理の範囲は [設計ガイド](../docs/architecture/README.md) を参照してください。
