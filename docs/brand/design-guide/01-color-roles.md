## 1. 配色の役割分担（60-30-10）

下敷き: `02_notes/デザイン基礎/配色・カラー理論.md`。配分の目安は **ベース 60% / メイン 30% / アクセント 10%**
（brand-memo の 70/25/5 と同じ「主色を広く・差し色をごく少量」の思想。数値は目安）。

| 役割 | 何に使う | トークン |
|---|---|---|
| ベース 60%（ニュートラル） | 背景・サーフェス・境界線・本文/補足テキスト | `--color-bg` `--color-surface` `--color-surface-2` `--color-border` `--color-divider` `--color-text` `--color-text-muted` `--color-text-faint` `--color-heading` |
| メイン 30%（ブランド赤） | ロゴ地・見出し帯・リンク・ブランド面 | `--color-brand-50…900`（Tailwind: `brand-*` / 後方互換 `primary-*`） |
| アクセント 10%（**主 CTA 専用 1 色**） | 主要ボタンのグラデーションのみ | `--color-accent` / `--color-accent-to`（`formStyles.ts` の `btnPrimaryCls` だけが使用） |

### 意味ごとに色トークンを使い分ける（FR-224-04）

- **ブランド/CTA** → `--color-accent`（CTA）・`brand-*`（ブランド面）
- **種別（データ色）** → `SPECIES.color`（= `--species-american/bullfrog`）
- **状態（成功/警告/エラー/情報）** → `--color-success/warning/error/info`
- `text-red-*` を「なんとなく」使わない。赤は「ブランド」「エラー」「種色」のどれなのかを意識し、対応するトークンを選ぶ。
- 挿絵 SVG（例 `CrayfishIllustration.tsx`）は**装飾**のため固有色の直書きを例外として許容する。

---
