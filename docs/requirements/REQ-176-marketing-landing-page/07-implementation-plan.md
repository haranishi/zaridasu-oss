## 9. 実装計画

| 優先度 | 項目 | 依存関係 | 見積もり | ステータス |
|--------|------|----------|---------|-----------|
| P1 | LP文言・構成案の確定（コピーライティング） | なし | S | TODO |
| P1 | `/lp` ページ骨格＋全セクション実装（FR-176-01〜07, 11） | 文言確定 | L | TODO |
| P1 | `?auth=signup` AuthModal 自動起動（FR-176-08 / SC-176-02） | なし（並行可） | S | TODO |
| P1 | i18n `lp.*` キー追加（ja＋en/ko/zh 同構造） | 文言確定 | S | TODO |
| P2 | 計測イベント実装（FR-176-10）＋ gtm.d.ts 型追加 | LP骨格 | S | TODO |
| P2 | 実績数値ISR取得（API-176-01 / FR-176-06） | LP骨格 | S | TODO |
| P2 | SEO（metadata/OGP/sitemap/JSON-LD, NFR-176-13〜16） | LP骨格 | S | TODO |
| P2 | ヒーロー画像等メディア準備＋軽量化 | なし | S | TODO |
| P3 | a11y・レスポンシブ・ダークモード検証（NFR-176-07〜12, 17） | 全セクション | M | TODO |
| P3 | テスト（後述） | 実装完了 | M | TODO |
| P3 | SignupBanner からの `/lp` 導線（FR-176-12, 任意） | LP公開 | XS | TODO |

### テスト方針
- 単体（Vitest + RTL）: LpFaq の開閉と aria 属性 / LpStats の null フォールバック / CTAリンクの href・dataLayer 送出
- E2E（Playwright）: `/lp` 表示 → 主CTA → `/` で AuthModal（signup）が自動表示 → 閉じてクエリ除去 / 副CTA → `/` 遷移
- バンドル: `/lp` のFirst Load JS に leaflet チャンクが含まれないことを確認

---
