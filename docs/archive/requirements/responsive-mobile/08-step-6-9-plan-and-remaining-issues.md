## Step 6〜8: API仕様・データモデル・マイグレーション

本要件はフロントエンドのみの変更のため、API変更・DB変更・マイグレーションは不要。

---

## Step 9: 実装優先度と計画

| 優先度 | ID | 項目 | 依存関係 | 見積もり | ステータス |
|--------|-----|------|---------|---------|-----------|
| P1 | FR-001 | 管理テーブル→カード変換（全4画面） | なし | M | ✅ 完了 |
| P1 | FR-003 | セーフエリア対応統一 | なし | S | ✅ 完了 |
| P1 | FR-005 | モーダルのモバイル最適化 | なし | S | ✅ 完了 |
| P1 | FR-002 | タッチターゲット44px保証 | なし | S | ✅ 完了 |
| P2 | FR-004 | ローディング状態のモバイル対応 | なし | S | 🟡 部分完了 |
| P2 | FR-006 | AdminLayout ボトムナビ改善 | なし | S | ✅ 完了 |
| P2 | FR-007 | フォントサイズ・余白最適化 | なし | S | ✅ 完了 |
| P3 | FR-008 | ダークモード コントラスト改善 | なし | S | ✅ 完了 |

---

## 画面別 残存問題一覧と修正方針

### ✅ 対応済み

| # | 画面 | ファイル | 問題 | 修正内容 |
|---|------|---------|------|---------|
| 1 | 管理ユーザー | AdminUsersPage.tsx | UserDetailModal がモバイルで窮屈 | `p-4 sm:p-6`, `max-h-[90dvh]`, KPIパディング・フォントサイズレスポンシブ化 |
| 2 | AuthModal | AuthModal.tsx | `max-h` 制限なくスマホ画面外に | `max-h-[90dvh] overflow-y-auto` 追加 |
| 3 | AdminLayout | AdminLayout.tsx | ボトムナビ8項目で窮屈 | 主要4項目+「その他」メニューに再構成、`text-[11px]` |
| 4 | BarChart | BarChart.tsx | ラベルがモバイルで潰れる | `text-[10px] sm:text-xs truncate` + title属性 |
| 5 | themeClasses | themeClasses.ts | ダークモード `text-slate-500` コントラスト不足 | `faint()` → `text-slate-400`, ボーダー透過度 `/80` |
| 6 | ローディング | globals.css | ripple 600px が大きすぎる | `min(400px, 80vmin)` に縮小 |
| 7 | AreaPageClient | AreaPageClient.tsx | ダークモード `text-slate-500` インライン使用 | `text-slate-400` に修正 |

### 🟢 LOW: 余裕があれば対応

| # | 画面 | ファイル | 問題 | 修正方針 |
|---|------|---------|------|---------|
| 8 | AdminLogsPage | AdminLogsPage.tsx | 日付フィルターの `type="date"` がモバイルで小さい | パディング追加 |
| 9 | 全画面 | 各ファイル | フォーカスインジケーターの視認性 | `focus-visible:ring-2` 統一 |

---
