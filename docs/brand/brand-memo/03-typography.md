## 4. タイポグラフィ（2書体）

| 役割 | 書体 | 指定方針 |
|---|---|---|
| 見出し・本文（和文） | OS標準の和文ゴシック | `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', system-ui, sans-serif`。読みやすさ最優先で system フォントスタックを正本とする。 |
| UI・数字・ラテン | Inter | 既存どおり `src/app/layout.tsx` で読み込み済み（`display: swap`）。英字ラベル・数値・ロゴ副題（ZARIDASU）に使用。 |

- 見出しは太め（700〜800）でベネフィットを短く。本文は 400。
- **Web フォントの追加読み込みは本 REQ では行わない**。和文は当面 system フォントスタックを正本とし、もし Noto Sans JP 等の Web フォント導入を行う場合は、パフォーマンス（`display: swap`・サブセット）を含めて REQ-224 と調整する（NFR-225-02）。
- **OGP（`/api/og` および `og-image.svg`）の和文**は、上記の和文ゴシックスタック（`'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif`）を指定し、和文が崩れない方針とする。`/api/og` の生成ロジック自体の変更は REQ-027/REQ-042 に引き継ぐ。

---
