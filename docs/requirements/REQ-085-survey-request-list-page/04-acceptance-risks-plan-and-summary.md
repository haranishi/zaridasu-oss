## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-085-01 | `/requests` にアクセスすると open + responded の依頼一覧が新しい順に表示される |
| AC-085-02 | status / species / municipality / sort / owner のフィルタが URL クエリと同期する |
| AC-085-03 | カード押下で `/request/[id]` に遷移する |
| AC-085-04 | マイページに「自分が立てた依頼」導線があり、`?owner=me` で自分の全 status の依頼が見える |
| AC-085-05 | 0 件 / フィルタヒットなし / エラー時のフォールバック UI が表示される |
| AC-085-06 | 既存テスト（`HomePage.test.tsx` 含む）が引き続き通る |
| AC-085-07 | Lighthouse a11y スコア 95 以上 |

---

## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| 既存 `useSurveyRequests` の filter 拡張で他画面に副作用 | 引数を optional にして既存呼び出しの挙動を不変に保つ |
| 200 件 limit の固定でデータ増加時に切れる | Phase 1 では割り切り、ページネーションは将来要件で |
| 一覧 SEO とプライバシー（reason 全文公開）のトレードオフ | reason は冒頭 60 文字のみ line-clamp、詳細ページで全文 |
| 市区町村リストの定数化が未整備 | 既存 `useReverseGeocode` で得られる名称を流用、不足分は段階的に追加 |
| URL クエリと state の双方向同期で render ループ | `useSearchParams` の readonly 利用 + `router.replace` で防止 |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | `/requests` ルートと一覧 UI 雛形 | なし | S | TODO |
| P0 | フィルタ（status / municipality / sort） | 上記 | S | TODO |
| P1 | owner=me フィルタとマイページ導線 | hook 拡張 | XS | TODO |
| P1 | 空状態 / エラー UI | 上記 | XS | TODO |
| P2 | i18n キー追加と翻訳 | 上記全部 | XS | TODO |
| P2 | a11y 検証（キーボード / SR） | 全部 | XS | TODO |

合計工数: **M（1〜2 日）**

---

## サマリー

調査依頼機能の最大の UX ボトルネック「地図経由でしか発見できない」を、独立した `/requests` 一覧ページで解消する。既存 `useSurveyRequests` を破壊的変更せず引数を追加するだけで実装でき、Phase 2 以降の導線（結果投稿・協力・コメント）の起点にもなる。

### 次のアクション
1. `src/app/requests/page.tsx` と `src/views/SurveyRequestsListPage.tsx` を雛形作成
2. フィルタコンポーネントを既存 UI トーンに合わせて実装
3. マイページ導線を追加し、Phase 2（REQ-086）の結果投稿フローへバトンを渡す
