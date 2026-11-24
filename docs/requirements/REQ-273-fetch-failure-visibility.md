# REQ-273: データ取得失敗の可視化と操作安全

優先度: **P1** ／ 深刻度: **High**（問題A・B）〜Low ／ 種別: UX（エラーハンドリング）

## 背景

模範実装（DetailPage / RankingPage / ProfilePage: loading・error(再試行)・empty の3分離）が存在する一方、以下が取り残されている。

### 問題A: トレンド画面がフェッチ失敗を無言で「全0件」表示 — High
`src/views/TrendsPage.tsx:20` は `const { stats, loading } = useStats({ months: 12 })` と **`error` を受け取らない**。失敗時は `stats=null` のまま `stats?.speciesCounts?.[…] || 0` が全て0になり、空グラフを正常表示のように描画する。再試行手段なし。`DashboardPage.tsx:127` の折りたたみ統計も同様に error を無視。

### 問題B: ホーム投稿一覧の失敗が消えるトースト1回のみ — High
`src/hooks/posts/usePostList.ts:110,137` は error state を持たず、`toast.error('データの取得に失敗しました。…')`（**ハードコード日本語**・t()未経由）のみ。地図/一覧は空のままで、「0件」と「失敗」を区別できず、再試行導線が無い。

### 問題C: 調査依頼一覧のエラーが生の技術文字列・再試行なし — Medium
`src/views/SurveyRequestsListPage.tsx:143-145` は `useSurveyRequests` の `error`（`err.message`＝PostgREST生文言）をそのまま表示。詳細側（`SurveyRequestPage.tsx:131-149`）は `t('common.loadError')`＋再試行で実装済みと不統一。

### 問題D: 調査依頼「クローズ」が確認なし・catchなし・二重押下防止なし — Medium
`src/views/SurveyRequestPage.tsx:488-500`。誤タップで即クローズ（再オープンUIなし）。失敗時も無反応で成功と誤認する。他の破壊的操作（投稿削除=ダイアログ、コメント削除=インライン確認、アカウント削除=文字入力確認）と方針不統一。

### 問題E: コメント送信の同期二重送信ガード欠如 — Low
`src/components/features/posts/CommentSection.tsx:93-106`。`if (submitting) return` が無く、Enter連打で楽観コメント二重append＋二重insertの余地（`useLike` の `togglingRef`・`PostForm` の `if (loading) return` と非対称）。

### 問題F: AI再解析トリガー失敗の無言破棄 — Low
`src/hooks/posts/useEditPost.ts:104-110` が `.catch(() => {})`。`CommentSection.tsx:161` は `logError` する実装と不統一。恒常失敗しても検知不能で `ai_result` が「判定中」のまま残留。

## 機能要件

- **FR-273-01**: TrendsPage で `useStats` の `error` を受け取り、エラー時は RankingPage の `LoadErrorState` 同型の「エラー表示＋再試行」を出す（グラフの0件偽装をやめる）。DashboardPage の統計セクションも同様。
- **FR-273-02**: `usePostList` に `error` state と再試行手段を追加し、HomePage にエラー時の永続バナー（再試行ボタン付き）を表示する。トースト文言は i18n キー化（ja/en/zh/ko 4言語）。
- **FR-273-03**: SurveyRequestsListPage のエラー表示を `t('common.loadError')`＋再試行ボタンに統一する（生メッセージの露出をやめる）。
- **FR-273-04**: 調査依頼クローズに (a) 確認ステップ、(b) try/catch＋失敗トースト、(c) 処理中の disabled を追加する。
- **FR-273-05**: CommentSection `handleSubmit` 冒頭に同期二重送信ガードを追加する。
- **FR-273-06**: `useEditPost` の再解析トリガー失敗を `logError(err, 'useEditPost:reanalyze')` で記録する。

## 受入基準

- **AC-01**: ネットワーク遮断状態で /trends・ホーム・/requests を開くと、いずれも「読み込みエラー＋再試行」が表示され、再試行で復帰する（0件表示や無言にならない）。
- **AC-02**: クローズは確認を経てのみ実行され、失敗時にトーストが出る。
- **AC-03**: 追加した i18n キーが4言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-04**: `lint` / `type-check` / 既存627テストがパスする。
