## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| FAB が他のフローティング UI（地図のズームコントロールなど）と被る | `/requests` ページには地図が無いため衝突しない。BottomNav とは `bottom-20` で確実にオフセット |
| `DrawerMenu` のメニュー項目が増えてスクロール必須になる | 現状縦方向に余裕あり。1 項目追加で破綻しないが、「マップ設定」「その他リンク」の整理タイミングで再検討 |
| 未ログイン時の挙動がメニュー経由（AuthModal）と FAB 経由（router.push）で違う | 妥当な差異。/requests に AuthModal を持ち込むのは過剰。後続要件で統一を検討可 |
| 「依頼」と「投稿」のボタンが両方目立つと初心者が混乱する | FAB ラベル / アイコンを「投稿」（+）と区別し「🔍」を使う。FAB tooltip / micro-copy で「依頼を立てる」を明示 |
| Phase 1 リリース後にユーザーが「依頼ってなに？」となる | 別要件で「使い方」ページに依頼セクションを追加（本要件外） |
| BottomNav の `VISIBLE_PATHS` に `/requests` が含まれていない場合 FAB のオフセット計算が変わる | コード側で `usePathname` 不要、単純に safe-area + 余裕値で固定オフセットすれば破綻しない |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | Header の `onSurveyClick` destructure + DrawerMenu に転送（FR-090-02） | なし | XS | TODO |
| **P0** | DrawerMenu に「調査依頼を立てる」項目追加（FR-090-01） | 上記 | S | TODO |
| **P0** | SurveyRequestsListPage に FAB + Form マウント（FR-090-03 / 04） | なし | S | TODO |
| P1 | 未ログイン時のフォールバック整合性確認（FR-090-05） | 上記 | XS | TODO |
| P1 | スマホ / タブレット / PC での目視確認（safe-area） | 全部 | XS | TODO |
| P2 | ビルド確認 (`npx next build`) | 全部 | XS | TODO |
| P2 | DrawerMenu / SurveyRequestsListPage のユニットテスト追加 | 全部 | M | OPTIONAL |

合計工数: **S（半日以内）**

---
