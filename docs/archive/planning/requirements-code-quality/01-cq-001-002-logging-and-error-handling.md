## CQ-001: `console.error` の直接呼び出し残留

### 問題

`errorHandler.ts` の `logError()` を使わず、コンポーネント・フックで直接 `console.error` を呼んでいる。
本番ビルドでもログが出続け、将来的な外部エラー監視サービス（Sentry等）への移行が困難になる。

### 対象箇所

| ファイル | 行 | コード |
|---------|-----|-------|
| `src/pages/HomePage.jsx` | 107 | `console.error('データ取得エラー:', err)` |
| `src/pages/HomePage.jsx` | 124 | `console.error('追加読み込みエラー:', err)` |
| `src/pages/admin/AdminUsersPage.jsx` | 161 | `console.error('get_admin_user_list error:', error)` |
| `src/lib/auditLog.js` | 23 | `console.error('[audit_log] write failed:', error)` |
| `src/components/modals/ReportModal.jsx` | 37 | `console.error(err)` |
| `src/components/ui/ErrorBoundary.jsx` | 14 | `console.error('ErrorBoundary caught:', error, errorInfo)` |
| `src/hooks/useCsvExport.js` | 58 | `console.error('Error exporting CSV:', error)` |

### 受け入れ条件

- [ ] 上記7箇所の `console.error` を `logError(err, 'コンテキスト名')` に置き換える
- [ ] `ErrorBoundary` は class component のため `logError` を static import して使用する
- [ ] `auditLog.js` は書き込み失敗の silent 失敗であるため `logError` に加えてエラーを握りつぶさない設計にする
- [ ] `console.log` が残留していないことを grep で確認する

---

## CQ-002: エラーハンドリング不足・空 catch

### 問題

catch ブロックが空、または握りつぶしになっており、デバッグ・障害対応が困難。

### 対象箇所

| ファイル | 行 | 問題 |
|---------|-----|-----|
| `src/context/AuthContext.jsx` | 14–16 | `.catch(() => { setLoading(false) })` — エラー内容を無視 |
| `src/pages/DetailPage.jsx` | 48–50 | `if (!error && data)` — error を握りつぶし（toast 通知なし） |
| `src/hooks/usePostForm.js` | 121–122 | `} catch { stored = [] }` — localStorage 読み込み失敗を無視 |
| `src/pages/admin/AdminReportsPage.jsx` | 99 | catch ブロックが空 |
| `src/pages/admin/AdminPostsPage.jsx` | 複数 | エラーをスルーしている try-catch |

### 受け入れ条件

- [ ] catch で必ず `logError(err, 'コンテキスト')` を呼ぶ
- [ ] ユーザーに見せるべきエラーは toast または state 経由で通知する
- [ ] localStorage の parse 失敗は想定内の例外として `logError` 後に `stored = []` fallback は維持してよい
- [ ] `DetailPage` の投稿取得失敗時に "データの取得に失敗しました" toast を表示する

---

