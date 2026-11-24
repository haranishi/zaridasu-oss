## 背景
Next.js 15 App Router のビルド出力に対し、現状 CI では以下のパフォーマンス回帰を検出できない：

- バンドルサイズの肥大化（依存追加・dynamic import 漏れ）
- ホームページ LCP / CLS の悪化（REQ-011 / REQ-022 で改善済みの項目が knock-back される）
- 主要ルートの JS First Load サイズ上振れ

現状の `next build` 出力（直近 main ブランチ）:
- `/` （ホームページ）: First Load JS ≈ 232KB
- `/admin/posts`: First Load JS ≈ 243KB
- ホームページ Lighthouse Performance: 80+

`.github/workflows/ci.yml` には bundle-size チェックも Lighthouse CI も無い（`lint` / `type-check` / `build` / `test` のみ）。
リグレッションが起きると Core Web Vitals 悪化 → SEO 低下 → UX 低下が即座に本番に届く。

## 守りたい不変条件
- INV-01: `next build` 後の `/admin/posts` ルートの First Load JS が **300KB を超えない**（現在 243KB、余裕 57KB）
- INV-02: `next build` 後の `/` ルートの First Load JS が **300KB を超えない**（現在 232KB、余裕 68KB）
- INV-03: ホームページ `/` の Lighthouse Performance スコアが **80 を下回らない**（REQ-011 で改善した LCP / CLS の回帰検知）
- INV-04（任意・閾値運用）: `/admin/posts` のルート JS が 20% 以上急増したら警告（ソフト閾値、`.size-limit.json` の warning）

## 現状の検出可否
- `.github/workflows/ci.yml:1-51` にバンドル計測 / Lighthouse step なし
- `npm run build` は実行されているが出力サイズのアサートは無し
- Core Web Vitals 回帰は本番 GA4 / Search Console 到達後に初めて気付く

## テスト種別と環境
- 種別: contract（performance / bundle size）
- フレームワーク:
  - `size-limit` + `@size-limit/file`（静的ファイルサイズ計測）もしくは Next.js 公式の `@next/bundle-analyzer` + JSON parse
  - `@lhci/cli`（Lighthouse CI）
  - GitHub Actions: `treosh/lighthouse-ci-action@v11` or `npx lhci autorun`
- 配置先:
  - `.size-limit.json`（新規、ルートに配置）
  - `.lighthouserc.json`（新規、ルートに配置）
  - `.github/workflows/ci.yml` 更新 or 新規 `.github/workflows/perf.yml`
- 備考: Lighthouse は `npm run start` でローカル起動した Next.js に対して実行（Preview deploy URL を使う場合は Vercel デプロイ後を参照）

