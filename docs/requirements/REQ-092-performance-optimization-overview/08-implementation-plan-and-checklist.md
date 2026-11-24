## 9. 実装計画（優先度・フェーズ分け）

### フェーズ A — 計測基盤（すぐ実装、見積もり XS）
| 優先度 | ID | 項目 | 依存 | 見積 | ステータス |
|---|---|---|---|---|---|
| P0 | T-01 | `@next/bundle-analyzer` 導入（FR-092-11） | なし | XS | TODO |
| P0 | T-02 | 本番 web-vitals → GA4 送信（FR-092-10） | なし | S | TODO |
| P0 | T-03 | size-limit 閾値を実測+10% へ引き締め | REQ-062 | XS | TODO |

### フェーズ B — 速攻削減（1〜2 PR）
| 優先度 | ID | 項目 | 依存 | 見積 | ステータス |
|---|---|---|---|---|---|
| P1 | T-04 | leaflet.heat 動的化 + Leaflet CSS 集約（REQ-026） | A | M | TODO |
| P1 | T-05 | next/image 全面化（REQ-022 / REQ-041） | A | M | TODO |
| P1 | T-06 | モーダル群を dynamic({ssr:false})（FR-092-02） | A | S | TODO |
| P1 | T-07 | `next.config.ts` に images.formats=['image/avif','image/webp'] と experimental.optimizePackageImports 追加 | A | XS | TODO |

### フェーズ C — クエリ / RSC 化（2〜3 PR）
| 優先度 | ID | 項目 | 依存 | 見積 | ステータス |
|---|---|---|---|---|---|
| P2 | T-08 | `get_dashboard_stats` RPC 化（REQ-032） | A | M | TODO |
| P2 | T-09 | `select('*')` 棚卸し → 列指定徹底 | A | M | TODO |
| P2 | T-10 | sitemap select 列限定 + ページネーション（REQ-032） | A | S | TODO |
| P2 | T-11 | HomePage の RSC 化（FR-092-01） | T-04, T-06 | L | TODO |
| P2 | T-12 | Footer / SignupBanner / HowToSection 等の RSC 化 | A | M | TODO |

### フェーズ D — キャッシュと依存棚卸し
| 優先度 | ID | 項目 | 依存 | 見積 | ステータス |
|---|---|---|---|---|---|
| P3 | T-13 | Route Segment Config 整備（revalidate / dynamic）| C | M | TODO |
| P3 | T-14 | date-fns v3 アップグレード | A | M | TODO |
| P3 | T-15 | lucide-react 個別 import 化 + optimizePackageImports | A | S | TODO |
| P3 | T-16 | `fix-webm-duration` の必要性再評価（録音不使用ルートで剥がれているか） | A | S | TODO |

### フェーズ E — 仕上げ
| 優先度 | ID | 項目 | 依存 | 見積 | ステータス |
|---|---|---|---|---|---|
| P4 | T-17 | Lighthouse perf を `error 0.85` に格上げ | A〜D 完了 | XS | TODO |
| P4 | T-18 | size-limit を最終値で固定 | A〜D 完了 | XS | TODO |
| P4 | T-19 | リリースノート / 計測スナップショット記録 | 全完了 | S | TODO |

---

## 10. 現状分析チェックリスト（着手時に埋める）

- [ ] `npm run build` 出力の Route別 First Load JS 表をスクショ保存
- [ ] `ANALYZE=true npm run build` の treemap で Top 10 重量モジュール抽出
- [ ] `grep -rn "select('\*')" src/` の全件リスト化
- [ ] `grep -rn "<img " src/` で `<img>` 直 jsx 直書きの全件リスト
- [ ] `grep -rn "'use client'" src/` で 94 件の必要性 ✕ / ◯ 判定
- [ ] Lighthouse mobile 1 回計測（`/`, `/trends`, `/dashboard`, `/post/[id]`, `/area/[municipality]`）
- [ ] PageSpeed Insights（field data: 本番 28 日中央値）取得
- [ ] Supabase Dashboard で「直近 24h の slow query top 10」確認
- [ ] Service Worker（`public/sw.js`）が想定外キャッシュをしていないか確認

---
