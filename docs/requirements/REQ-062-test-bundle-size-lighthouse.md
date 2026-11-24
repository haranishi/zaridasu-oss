# REQ-062: Bundle size / Lighthouse CI 閾値テスト

## これは何か

バンドルサイズと Lighthouse スコアの閾値を CI で機械的に守るためのテスト要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

`.github/workflows/ci.yml` は `lint` / `type-check` / `build` / `test` のみで、バンドル肥大化・LCP / CLS 悪化・主要ルートの First Load JS 上振れを検出できない。リグレッションが起きると Core Web Vitals 悪化 → SEO 低下 → UX 低下がそのまま本番に届き、気付くのは GA4 / Search Console に到達してからになる。直近 main の実測は `/` が約 232KB、`/admin/posts` が約 243KB、ホームページ Lighthouse Performance が 80+。

## 主要な決定事項の要点

- 守る不変条件は INV-01 `/admin/posts` の First Load JS 300KB 以下、INV-02 `/` の First Load JS 300KB 以下、INV-03 ホームページ Lighthouse Performance 80 以上、INV-04（任意）ルート JS の 20% 急増を警告。
- 計測は `size-limit` + `@size-limit/file` と `@lhci/cli` で行い、設定は `.size-limit.json` / `.lighthouserc.json` をルートに新規配置する。
- Lighthouse は `npm run start` で起動したローカル Next.js に対して実行する（Preview deploy URL を使う場合は Vercel デプロイ後を参照）。CI 環境のばらつきは `throttlingMethod = 'simulate'` で安定化する。
- 対象は主要 5 ルートのバンドルサイズと、Lighthouse は `/` と `/dashboard` の 2 ルート（管理画面は認証必須のため除外）。
- 導入直後は TC-04 でベースラインを確定し、main で 3 回連続 green を確認してから閾値運用に入る。
- 優先度は Low（UX 回帰は痛いが本番 GA4 / Search Console でも追跡可能。体制整備後に追加推奨）。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-invariants-and-environment.md](REQ-062-test-bundle-size-lighthouse/01-background-invariants-and-environment.md) | 背景と現状の実測値、守りたい不変条件 INV-01〜04、現状の検出可否、テスト種別・フレームワーク・配置先 |
| [02-test-cases.md](REQ-062-test-bundle-size-lighthouse/02-test-cases.md) | テストケース TC-01〜04（Given/When/Then と CI ステップ。バンドル上限 2 本・Lighthouse 80+・ベースライン確定） |
| [03-coverage-acceptance-and-priority.md](REQ-062-test-bundle-size-lighthouse/03-coverage-acceptance-and-priority.md) | カバレッジ目標、テストデータ／フィクスチャ（回帰デモ手順）、受入条件 AC-01〜03、影響範囲、優先度 |
