### FR-092-06: パッケージ tree-shaking 強化（新規 / REQ-093 候補）
- **説明**：`next.config.ts` の `experimental.optimizePackageImports` に以下を追加：
  - `lucide-react`（アイコン個別 import）
  - `date-fns`（v3+ にアップグレード後に有効）
  - `react-i18next`
- **処理**：
  - `lucide-react`：barrel import → 個別 import を ESLint で禁止する代わりに `optimizePackageImports` に任せる。
  - `date-fns` v2 → v3 アップグレード（ESM ネイティブ、tree-shaking 効率向上）。互換 API を `dateLocales.ts` で吸収。
  - 不要パッケージ（`fix-webm-duration` 等）が本当に必要か棚卸し。
- **出力**：見積 20〜40KB 削減。

### FR-092-07: フォント最適化（新規 / REQ-094 候補）
- **説明**：`next/font/google` の `Inter` を `subsets: ['latin']` のみで読み込み済み（OK）。日本語フォントは未追加（OK：システムフォント運用）。
- **追加施策**：
  - `display: 'swap'` 維持。
  - `preload: true`（デフォルト）の確認。
  - `font-feature-settings` の不要化を検証。
- **判断**：現状ほぼ最適化済み。本 REQ では「変更しない」を明示し、以降の日本語 Web フォント追加提案を却下する根拠とする。

### FR-092-08: Next.js キャッシュ戦略（新規 / REQ-095 候補）
- **説明**：
  - `/about`, `/privacy`, `/terms` は静的（既に static）。
  - `/trends`, `/area/[municipality]`, `/post/[id]`, `/requests` は ISR `revalidate: 60` を検討。
  - `sitemap.ts` は `revalidate = 3600` で運用（REQ-043）→ 値の妥当性を確認。
  - クライアント側 fetch を Server Components の `fetch(..., { next: { revalidate, tags } })` に寄せる。
- **入力**：各ルート設計。
- **処理**：Route Segment Config を全ルートに明示。
- **出力**：Vercel Edge / CDN ヒット率向上 → TTFB 短縮。

### FR-092-09: Server / Client 境界の見直し（新規 / REQ-096 候補）
- **説明**：94 個ある Client Component を分類し、本当に Client が必要な物のみに絞る。
- **処理**：
  - `Footer` / `HowToSection` / `SignupBanner` 等の表示専用は RSC 化。
  - `Header` / `BottomNav` / `DrawerMenu` は state を持つので Client 維持だが、内部の静的部分を子 RSC として切り出す。
- **出力**：JS バンドルから純粋ビュー部分が剥がれる。

### FR-092-10: Core Web Vitals の本番計測継続化（新規 / REQ-097 候補）
- **説明**：`web-vitals` ライブラリで LCP / INP / CLS / TTFB / FCP を GA4 にカスタムイベント送信。
- **処理**：
  - `app/providers.tsx` 内に Client コンポーネントとして CWV reporter を実装。
  - GA4 にイベント `web_vital` (`name`, `value`, `id`) を送信。
- **出力**：本番値で SLO 監視可能になる（合成 Lighthouse だけに依存しない）。

### FR-092-11: バンドル分析の常設（新規 / REQ-098 候補）
- **説明**：`@next/bundle-analyzer` を devDependency 追加。`ANALYZE=true npm run build` で stats レポート生成。CI には含めず手動運用。
- **処理**：`next.config.ts` を `withBundleAnalyzer` でラップ（環境変数で ON/OFF）。
- **出力**：開発者がリグレッションの原因チャンクを特定可能。

---
