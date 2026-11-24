## 3. タイポグラフィ（FR-224-08）

下敷き: `02_notes/デザイン基礎/タイポグラフィ.md`。書体方針の正本は brand-memo §4（2 書体）。

- **書体（2 種）**: 本文/見出し = 和文ゴシック system stack（`Hiragino Sans`→`Noto Sans JP`→…）+ ラテン/数値 = Inter。
  Tailwind `font-sans` / `font-display` がこの stack を参照（Web フォント追加読み込みは本 REQ では行わない）。
- **本文 16px 以上 / 行間 1.5**: `globals.css` で `body { font-size: var(--text-body /*16px*/); line-height: var(--leading-body /*1.5*/) }`。
  Tailwind `fontSize` は全段に行間込み（`text-base` = 16px/1.5）。
- **1 行 35-50 字**: 本文ブロックは `max-w-measure`（`--measure: 42rem`）で行長を制御する。
- **最小フォント**: 情報を担う本文/ラベルは **14px 以上**（`text-sm`）。**12px（`text-xs`）は補助メタ情報のみ**許容
  （例: グラフ軸の数値、タイムスタンプ）。`text-[10px]` 等の極小は使わない。
- 見出しは太め（700〜800）で短く、本文は 400（brand-memo §4）。

---

## 4. 8pt グリッド・レイアウト（FR-224-08）

下敷き: `02_notes/デザイン基礎/レイアウト・視覚的階層.md`。

- 余白は **8 の倍数（8 / 16 / 24 / 32 / 48 / 64）** に寄せる。
  Tailwind 既定の 4px 刻みは温存しつつ、意味名 `grid-1…8`（= 8…64px）と CSS 変数 `--space-1…8` を用意。
  目安: `p-2`(8) `p-4`(16) `p-6`(24) `p-8`(32)、セクション間は `gap-grid-3`(24) 〜 `gap-grid-6`(48)。
- **近接の原則**: 関連要素は近く、グループ間は離す。**内側の余白 ≤ 外側の余白**（カード内 padding < カード間 gap）。

---
