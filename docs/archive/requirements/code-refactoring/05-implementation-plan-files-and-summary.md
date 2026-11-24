## 実装計画

| 優先度 | 項目 | ID | 依存関係 | 見積もり | ステータス |
|--------|------|-----|---------|---------|-----------|
| P1 | Post 型定義の整備 | FR-001 | なし | M | TODO |
| P1 | 重複コード共通化（フォーカストラップ・天気アイコン・日付ロケール） | FR-003 | なし | S | TODO |
| P1 | AdminPostsPage 分割（965行） | FR-002a | FR-001, FR-003 | M | TODO |
| P1 | PostForm 分割（733行） | FR-002b | FR-003 | M | TODO |
| P2 | DetailPage 分割（489行） | FR-002c | FR-001, FR-003 | S | TODO |
| P2 | MapView 分割（464行） | FR-002d | なし | S | TODO |
| P2 | AuthModal 分割（423行） | FR-002e | なし | S | TODO |
| P2 | 定数ファイル分割 | FR-005 | なし | S | TODO |
| P3 | インポートパス統一 | FR-004 | FR-002, FR-005 | M | TODO |
| P3 | テーマクラスヘルパー統一 | FR-006 | FR-002 | M | TODO |

---

## 対象ファイル一覧

| ファイル | 行数 | 主な問題 | 対応 FR |
|---------|------|---------|---------|
| `views/admin/AdminPostsPage.tsx` | 965 | 肥大化, any型, ハードコード文字列 | FR-001, FR-002a |
| `components/features/posts/PostForm.tsx` | 733 | 肥大化, フォーカストラップ重複 | FR-002b, FR-003a |
| `views/DetailPage.tsx` | 489 | 肥大化, any型, 天気アイコン重複 | FR-001, FR-002c, FR-003b |
| `components/features/map/MapView.tsx` | 464 | 肥大化, 日付ロケール重複 | FR-002d, FR-003c |
| `components/modals/AuthModal.tsx` | 423 | 肥大化 | FR-002e |
| `views/DashboardPage.tsx` | 416 | 肥大化 | FR-002（P3） |
| `components/layout/Header.tsx` | 369 | 肥大化 | FR-002（P3） |
| `views/ProfilePage.tsx` | 313 | any型 | FR-001 |
| `views/HomePage.tsx` | 311 | any型 | FR-001 |
| `hooks/useSurveyRequests.ts` | - | any型 | FR-001 |
| `hooks/useCsvExport.ts` | - | any型 | FR-001 |
| `components/ui/charts/DonutChart.tsx` | - | any型 | FR-001 |
| `components/modals/EditDialog.tsx` | - | フォーカストラップ重複 | FR-003a |
| `components/modals/DeleteDialog.tsx` | - | フォーカストラップ重複 | FR-003a |
| `components/features/posts/PostCard.tsx` | - | 日付ロケール重複 | FR-003c |
| `lib/constants.ts` | 232 | 責務過多 | FR-005 |
| `context/*.tsx` | - | 相対パスインポート | FR-004 |

---

## サマリー

### 課題の全体像
- **型安全性:** 11ファイルで `any` 型が使用されており、ランタイムエラーのリスクがある
- **ファイル肥大化:** 400行超が7ファイル、最大965行。コードレビュー・修正が困難
- **コード重複:** フォーカストラップ(3箇所)、天気アイコン(2箇所)、日付ロケール(3箇所)が重複
- **スタイル不統一:** インポートパスとテーマ適用方法が混在

### 期待される効果
- 型エラーの事前検出により、バグの発生率低減
- ファイル分割により、変更の影響範囲を局所化
- 重複排除により、修正漏れ・不整合を防止
- コードスタイル統一により、可読性と新規参入者のオンボーディング効率を向上

### 次のアクション
1. **P1 から着手:** FR-001（型定義）→ FR-003（重複共通化）→ FR-002a,b（大ファイル分割）
2. **各ステップ後にビルド確認:** `next build` + `tsc --noEmit` で動作確認
3. **P2, P3 は段階的に実施:** 既存の開発と並行して進行可能
