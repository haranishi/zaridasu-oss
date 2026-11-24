## 14. 次のアクション（提案）

1. **承認** ：本 REQ-092 の方針 / KPI / フェーズ分けに OK/NG をください。
2. 承認後すぐ着手すべき P0（T-01〜T-03）：bundle-analyzer 導入 / web-vitals 送信 / size-limit 引き締め。これだけで「数値を見る基盤」が整う。
3. その後 P1（T-04〜T-07）：1〜2 PR で 30〜60KB 削減を実証。
4. 並行して `/gen-requirements REQ-092` で REQ-093〜098 を自動生成し、子チケット化。

---

## サマリ

- ザリダスの軽量化は **「計測基盤 → 速攻削減 → RSC/クエリ → キャッシュ → 仕上げ」** の 5 フェーズで進める。
- 既に手は打たれている（dynamic Map、size-limit、lhci、next/image remotePatterns）が、**HomePage 全体が Client / 画像が `<img>` / 統計が 6〜7 並列クエリ** という三大ボトルネックで効果が相殺されている。
- 本 REQ-092 は新規作業ではなく、既存 REQ-010/022/026/032/041/062 を束ねつつ、足りない 6 本（REQ-093〜098）を追加するロードマップ。
- KPI は LCP ≤ 2.5s / INP ≤ 200ms / First Load JS ≤ 200KB（`/`）。Lighthouse perf ≥ 85（mobile）。
- 最初に着手すべきは「bundle-analyzer + 本番 web-vitals + size-limit 引き締め」（P0、合計 1 PR 以内）。
