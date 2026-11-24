## 4. 非機能要件

### パフォーマンス
- [ ] NFR-176-01: LPは静的配信（実績数値のみ `revalidate: 86400` のISR）。Leaflet・地図関連・i18next 初期化等の重量チャンクをLPバンドルに含めない（バンドル分析で確認、REQ-145 のチャンク分割方針を踏襲）
- [ ] NFR-176-02: Core Web Vitals 目標 — LCP < 2.5s（モバイル4G）/ CLS < 0.1 / INP < 200ms。ヒーロー画像は `next/image` + `priority` + 適切な `sizes`
- [ ] NFR-176-03: 画像・動画は `/optimize-media` プリセットで軽量化済みのものを使用（WebP優先）

### セキュリティ
- [ ] NFR-176-04: 認証不要・読み取り専用ページ。クライアントからの Supabase 直接アクセスなし（実績数値はサーバー側で取得）。フォーム入力なし（XSS入力面なし）
- [ ] NFR-176-05: `?from=lp` 等のクエリは描画に直接埋め込まない（埋め込む場合はエスケープ必須）

### i18n
- [ ] NFR-176-06: 初期リリースは日本語のみ（ターゲットが秋田県住民のため）。ただし文言は直書きせず `src/locales/ja/translation.json` の `lp.*` キーに集約し、将来 en/ko/zh を追加可能な構造とする。`npm run i18n:check`（REQ-114）の対象外にならないよう、暫定的に en/ko/zh にも同一構造のキーを用意する（値は ja ベースの翻訳。機械翻訳レベルで可）

### アクセシビリティ（WCAG 2.1 AA）
- [ ] NFR-176-07: 見出し階層（h1はキャッチコピー1つ）、ランドマーク（header/main/footer）、FAQアコーディオンは `button` + `aria-expanded` + `aria-controls`
- [ ] NFR-176-08: CTAボタンのコントラスト比 4.5:1 以上（brand red `#dc2626` on white は要実測。白文字 on `#dc2626` は AA 合格）
- [ ] NFR-176-09: `prefers-reduced-motion: reduce` 時はスクロールアニメーション・パララックスを無効化（既存 globals.css の方針踏襲）
- [ ] NFR-176-10: 追従CTAバー（モバイル）がコンテンツ・フッターリンクを恒常的に覆い隠さないこと

### レスポンシブ
- [ ] NFR-176-11: ブレークポイント `xs(375px)` / `sm` / `md` / `lg` で崩れなし。モバイルファースト実装。広告流入の主デバイスはスマホと想定
- [ ] NFR-176-12: モバイルでは追従フッターCTAバー、md以上ではヒーロー内CTA中心の配置

### SEO
- [ ] NFR-176-13: `metadata`: title「ザリダスとは | ザリダス」（テンプレート利用）、独自 description、OGP画像（LP専用 `og-image-lp.png` 1200×630 推奨、なければ既存流用）
- [ ] NFR-176-14: `sitemap.ts` に `/lp` を追加（`changeFrequency: 'monthly'`, `priority: 0.9`）。robots は許可のまま
- [ ] NFR-176-15: JSON-LD: `WebPage` ＋ FAQセクションの `FAQPage`（/about と質問が重複しないようLP固有の質問にする）
- [ ] NFR-176-16: `/` との重複コンテンツ回避: LPの description・h1 はルートと別文言にする

### ダークモード
- [ ] NFR-176-17: 既存 `dark:` クラス体系で両モード対応（LPだけライト固定にしない）

---
