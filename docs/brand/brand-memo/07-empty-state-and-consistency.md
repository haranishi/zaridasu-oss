## 8. 空状態へのマスコット転用（FR-225-11 / AC-10）

- **決定: 素材（`public/mascot-empty.svg`）を本 REQ で提供し、実際の配置・3状態（Loading / Empty / Error）UI 実装は REQ-222 に渡す。**
- `mascot-empty.svg` は線画・`currentColor` で軽量。利用側で `text-gray-300` などブランドに沿った淡色を当てる。
- 装飾目的のため、表示時は `aria-hidden="true"`（または `role="presentation"`）を付け、支援技術には文言（例: 「まだ報告がありません」）だけが読まれるようにする（NFR-225-06）。
- 文言はやさしいトーン（例: 「まだ報告がありません。最初の1件をのせてみませんか。」）。

---

## 9. 一貫性チェック（NFR-225-03）

このメモの値と、以下のファイルが矛盾していないこと:

- `tailwind.config.js`（`primary` = 50/100/500/600/700、`#dc2626` 基準）
- `src/app/layout.tsx`（`theme-color="#dc2626"`、`icons` に `favicon.ico` ＋ `icon-192.svg`）
- `src/app/manifest.ts`（`theme_color="#dc2626"` / `background_color="#ffffff"`、icons は `icon-192/512.svg`）
- `public/og-image.svg` / `og-image.png`（ブランド赤グラデ・やさしいコピー）
- `public/opensearch.xml`（host = `zaridasu.com`、`<Image>` = `/favicon.ico`）
