## 5. トークン早見表（正本 = `src/app/globals.css`）

| カテゴリ | トークン | Tailwind 参照例 |
|---|---|---|
| ニュートラル | `--color-bg` `--color-surface(-2)` `--color-border` `--color-divider` `--color-text` `--color-heading` `--color-text-muted` `--color-text-faint` | `bg-surface` `text-ink-muted` `border-divider` / `text-[var(--color-text-faint)]` |
| ブランド | `--color-brand-50…900` | `bg-brand-600` `text-brand-700` |
| アクセント(CTA) | `--color-accent` `--color-accent-to` `--color-accent-hover(-to)` | `btnPrimaryCls` のみ |
| 状態 | `--color-success/warning/error/info`（+ `-fg`） | `bg-[var(--color-warning)]` `text-[var(--color-error)]` |
| データ可視化 | `--chart-1…7` `--chart-track` | `stroke="var(--chart-1)"` |
| 種別データ色 | `--species-american/bullfrog/unknown` | `SPECIES.color` |
| 用途別ステート | `--state-species-unknown` `--state-urgency-normal/urgent` `--state-survey-open/responded/closed` | inline style / SVG fill |
| 8pt 余白 | `--space-1…8` / `grid-1…8` | `gap-grid-3` |
| タイポ | `--font-sans` `--text-body` `--leading-body` `--measure` | `font-sans` `max-w-measure` |

> ダークモードは `.dark` で各トークンの対の値に切り替わる（クラストグルのみ・JS 再計算なし＝ランタイムコストゼロ・NFR-224-01）。
