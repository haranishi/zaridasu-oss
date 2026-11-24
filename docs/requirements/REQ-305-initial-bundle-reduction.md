# REQ-305: 初期バンドルの削減（Sentry常駐・zod混入・Leaflet CSS・翻訳・画像原本）

これは何か: 実測に基づき、全ルートに常駐している5領域（Sentry / zod / Leaflet CSS / ja翻訳 / 画像原本）を削る性能要件（P1 / High / 性能（バンドル）/ 提案・未実装）。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

2026-07-30 の実測で、主要ルートの First Load JS は 305〜347 kB、広告着地想定の /lp でも 214.6 kB あった。JS の削減余地は **Sentry 49.0 kB ＋ zod 16.5 kB ＝ 65.5 kB gzip**（主要ルート共通）に ja 翻訳の namespace 分割分が加わり、さらに CSS 14.8 kB raw とリポジトリ／SW キャッシュ約 800 kB がある。three.js・Leaflet JS・cluster・leaflet.heat の遅延分割は**完全に機能している**ため、本REQは「すでに分割されている領域」ではなく「分割されずに常駐している領域」だけを扱う。

## 主要な決定事項（要点）

- **実施順序: REQ-306（size-limit の監視範囲拡張・LHCI モバイル計測）を先に入れてから着手する。** 現行 CI は「/ の 332.2 kB のうち 9.3 kB（2.8%）」しか監視しておらず、削っても**戻ったときに検知できない**。
- **判断より先に計測**（FR-305-01）。`npm run analyze` でチャンク 9898 の内訳を確定するまで、Sentry の案②（遅延初期化）・案③（/lp のみ無効）を選定しない。
- **`tracesSampleRate: 0.1` は撤去する**（案①・FR-305-02）。Web Vitals は GA4 経路で別途生きているため実質の損失は小さい。サーバー／エッジ側の redact 適用は維持し REQ-211 の多層防御を壊さない。
- **zod 混入は設計整合性の問題でもある**。`useSurveyRequests.ts` と `schemas.ts` に「zod を同期グラフに載せない（NFR-213-01）」と明文化されているのに、`Header → DrawerMenu → useProfile` の別経路で破られている。`useProfile.ts` を分割し、**zod 非依存フックを別ファイルへ移す**（FR-305-04）。re-export で再び静的に繋がらないよう注意。
- **Leaflet CSS はグローバル固定をやめ、地図チャンクへ集約する**（FR-305-05）。MarkerCluster の CSS が正しく分割できている実例が根拠。`globals.css` の上書きルール（ズームボタン44px化を含む）も同時に移す。
- **ja 翻訳は最低限 `admin.*` の切り出しを必須**とする（FR-305-07）。管理者は極少数なので費用対効果が最も高い。`i18n:check` の4言語パリティは維持。
- **種アイコン PNG は 128×128 程度へ再書き出し**（推定 -800 kB）。`og-image.png` / `og-image-lp.png` は OGP に 1200×630 が必要なため**変更しない**。
- 目標: /lp の First Load JS を **185 kB 以下**（理論下限 165.6 kB）、主要6ルートから zod チャンクを排除、グローバル CSS の `.leaflet-*` を 0 種に。

## 分割ファイル

- [01-summary-and-measurements.md](REQ-305-initial-bundle-reduction/01-summary-and-measurements.md) — 作成日・優先度・状態・関連 ＋ 実施順序の注意 ＋ 背景（ルート別 First Load JS 表、/ の 332.2 kB 内訳、削減余地の総括）
- [02-problem-a-sentry.md](REQ-305-initial-bundle-reduction/02-problem-a-sentry.md) — 問題A: Sentry ブラウザ SDK 49.0 kB の常駐（チャンク実測の内訳、/lp で 56.3% を占める事実、対応案①〜④の比較表）
- [03-problems-b-to-e.md](REQ-305-initial-bundle-reduction/03-problems-b-to-e.md) — 問題B: zod 混入の import 連鎖と方針との矛盾／問題C: Leaflet CSS のレンダーブロッキング／問題D: ja 翻訳の単一 namespace／問題E: 種アイコン原本 PNG
- [04-requirements-and-acceptance.md](REQ-305-initial-bundle-reduction/04-requirements-and-acceptance.md) — 機能要件 FR-305-01〜07 ＋ 受入基準 AC-01〜09（数値目標と検証方法）＋ 対象外
