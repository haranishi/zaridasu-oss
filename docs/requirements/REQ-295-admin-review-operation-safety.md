# REQ-295: 管理画面の操作安全性とデータ整合（一括操作の偽成功・審査キューの無言失敗）

作成日: 2026-07-30
優先度: **P0** ／ 深刻度: **High**（問題A・B・C）〜Medium ／ 種別: UX・データ整合（管理）
状態: **提案 / 未実装**
関連: REQ-273（データ取得失敗の可視化）, REQ-274（非同期race）, REQ-142（管理select列限定）, REQ-192（fetch失敗と空状態の分離）, REQ-193（操作失敗のフィードバック）, REQ-223（フォームUX / FR-223-08 二重送信ガード）, REQ-247（管理データアクセス層の分離）

## 背景

**同一リポジトリ内に、同じ問題を正しく解いた実装が既にある。** 管理画面だけがその方針の外に取り残されている。

| 論点 | 正しい実装（模範） | 管理画面の現状 |
|---|---|---|
| 取得失敗を空状態と分離 | REQ-273/REQ-192 で TrendsPage・HomePage・SurveyRequestsListPage・RankingPage が error state ＋ 再試行を持つ | `useAdminPosts` は error state を持たず「審査待ち0件」に化ける（問題B） |
| 0行削除のサイレント失敗検知 | `useAdminPosts.deletePost`（同ファイル :344-353）が `.select('id')` で 0 行を検知し `throw` | 同ファイルの `bulkDelete`（:271-272）は `if (!error)` のみで 0 行削除を検知しない（問題C） |
| stale応答ガード | REQ-274 で `usePostList.ts:53-184` / `useAdminKpi.ts:212` / `useAdminStats.ts:59` が AbortController ＋ aborted ガード | 管理一覧系4箇所は素朴な setLoading→await→setState（問題D） |
| クラッシュの本番監視 | `app/error.tsx:44` は `logError`、`app/global-error.tsx:25` は `Sentry.captureException` | `app/admin/error.tsx:15` は `console.error` のみ（問題E） |
| 二重送信の同期ガード | REQ-223 FR-223-08 に従い `PostForm` / `SurveyRequestForm.tsx:78` / `AuthModal.tsx:258` が冒頭 `if (loading) return` | `AdminPostsPage.tsx:93-103` の一括操作は `disabled` 頼み（問題F） |

管理画面は**審査ワークフローそのもの**であり、ここが静かに壊れると投稿は `pending` のまま公開されない。一般ユーザー側は REQ-273 で修正済みなのに、見落としが最も致命的な審査キューが同じ穴を残している点が本 REQ の主眼である。

### 問題A: 一括承認が全件失敗しても成功トーストを出す — High

`src/hooks/admin/useAdminPosts.ts:289-318`（`bulkApprove`）。ループ内は `if (!error)`（:302）のときだけ監査ログを書くが、**`done++`（:311）は if の外**にあり成功/失敗を区別せずカウントする。ループ後の `toast.success(\`${done}件を承認しました\`)`（:313）は無条件に実行される。

管理者が10件を選択して一括承認し、RLS 拒否・ネットワーク断・DB エラーで**全件失敗しても「10件を承認しました」**が表示される。直後の `fetchPosts()`（:316）で一覧は「審査待ち10件」のまま再描画されるため、管理者は「承認済みなのに表示が古い」と誤認して画面を離れる。投稿は未公開のまま放置され、投稿者には承認通知も却下通知も届かない。

同ループの進捗テキスト（:296 の `` `承認中… ${done + 1}/${targets.length}` ``）と成功トースト（:313）は `t()` を経由しない日本語ハードコードでもある（`bulkDelete` 側 :263 は `t('admin.posts.bulkProgress')` を使うので非対称）。

### 問題B: 審査キューの取得失敗が完全に無言で「審査待ち0件」に化ける — High

`src/hooks/admin/useAdminPosts.ts:149-161`。`const { data, count, error } = await query` の後、**成功時（`if (!error)`）のみ setState** し、error state もトーストも存在しない。失敗すると `posts` は前回値（初期は `[]`）のまま `setLoading(false)` される。

`src/views/admin/AdminPostsPage.tsx:320-323` の `!loading && posts.length === 0` 分岐に落ちるため、画面には **「審査待ちの投稿はありません」**（:322・これも日本語ハードコード）が出る。さらに `fetchPendingCount`（:127-133）は `const { count } = await …` と **error を destructure すらせず** `setPendingCount(count ?? 0)`（:132）とするため、サイドバーのバッジも 0 になる。

結果、審査者は「今日は審査対象なし」と判断して離脱する。取得失敗が続く限り投稿は延々と `pending` に積み上がり、誰も気づかない。

### 問題C: 一括削除が写真を先に消し、失敗を一切通知しない（復旧不能） — High

`src/hooks/admin/useAdminPosts.ts:256-287`（`bulkDelete`）。ループ内で

1. `await supabase.storage.from('post-photos').remove(paths)`（:269）— **戻り値のエラーを見ない**
2. `const { error } = await supabase.from('posts').delete().eq('id', post.id)`（:271）— `if (!error)`（:272）で監査ログを書くだけで、error 時の通知が無い

の順に実行する。**Storage 削除が DB DELETE より先**である点が本質的な欠陥で、DB DELETE が RLS 拒否や 0 行ヒットで失敗すると**投稿行は残ったまま写真だけが消える**。公開マップ・投稿詳細・OG 画像に画像切れの投稿が残り、写真は Storage から消えているので復旧できない。

成功/失敗どちらのトーストも無く（`bulkApprove` にはある成功トーストすら無い）、管理者は何が起きたか知る手段がない。同ファイルの単体 `deletePost` は `.select('id')`（:348）で 0 行削除を検知して `throw`（:351-353）し、成功トースト（:366）と `opError`（:373）を出すので、**単体と一括で安全性が非対称**である。

### 問題D: 管理一覧4箇所に stale応答ガードが無く、誤った母集団に破壊的操作を行える — High

REQ-274 で公開側（`usePostList`）と KPI 系（`useAdminKpi` / `useAdminStats`）は AbortController 化されたが、**同じ管理画面の一覧系4箇所は未適用**。

- `src/hooks/admin/useAdminPosts.ts:135-162`（`fetchPosts`）
- `src/views/admin/AdminReportsPage.tsx:101-110`（`fetchReports`）
- `src/views/admin/AdminCommentsPage.tsx:72-89`（`fetchComments`）
- `src/views/admin/AdminUsersPage.tsx:218-229`（`fetchUsers`）

いずれも `setLoading(true)` → `await` → `setPosts(...)` → `setLoading(false)` の素朴形で、`useAdminPosts` の `useEffect`（:164）は `page` / `filters` / `statusTab` の変更ごとに再発火する。タブを `pending` → `approved` と素早く切り替えて先行クエリが後着すると、**「pending」タブに approved 行が並ぶ**（last-resolved-wins）。アンマウント後の `setLoading(false)` も未ガード。

この画面には**一括承認・一括削除がある**。したがってこれは表示の乱れでは済まず、**審査者が誤った母集団に対して破壊的操作を行う導線が実在する**。

### 問題E: 管理画面のクラッシュだけが本番監視に上がらない — Medium（監視盲点としては High 寄り）

`src/app/admin/error.tsx:15` は `console.error('[AdminError]', error)` のみで、`logError` / `Sentry.captureException` を経由しない。`logError`（`src/lib/errorHandler.ts:129-147`）が `setErrorReporter` で登録された Sentry reporter へ転送する経路に乗らないため、**審査ワークフローのクラッシュだけが本番のエラー監視に現れない**。

審査が止まれば投稿は `pending` のまま滞留するが、それを検知する手段が利用者からの申告しかない。加えてこのファイルは全文が日本語ハードコード（:25「エラーが発生しました」/ :28 / :32 / :41 / :48）で i18n 未対応、かつ dark テーマ用のクラス指定が無い（他の admin 画面と不統一）。

### 問題F: 一括操作に REQ-223 の同期二重送信ガードが無い — Low

`src/views/admin/AdminPostsPage.tsx:93-103` の `handleBulkDelete` / `handleBulkApprove` は、確認ダイアログを閉じて `await bulkDelete()` / `await bulkApprove()` を呼ぶだけで、冒頭の同期ガード（`if (bulkProcessing) return`）が無い。REQ-223 FR-223-08 の方針（`disabled` は state 反映前の連打に隙があるため、ハンドラ先頭で同期 return する）が `PostForm` / `SurveyRequestForm` / `AuthModal` にはあるのに管理画面には無い。

## 機能要件

- **FR-295-01（一括操作の件数サマリ）**: `bulkApprove` / `bulkDelete` は成功件数と失敗件数を**別カウント**し、処理後に必ず結果を提示する。`failed === 0` なら成功トースト、`failed > 0` なら「N件成功・M件失敗」を warning/error として提示する。**全件失敗時に成功トーストを出してはならない**。失敗した post id は選択状態に残し、管理者が再試行できるようにする。文言は i18n キー化する（`admin.posts.bulkResult.*`）。
- **FR-295-02（一括操作の共通ヘルパー化）**: `bulkApprove` と `bulkDelete` の「進捗更新 → 1件処理 → 成功/失敗集計 → 監査ログ」ループを共通ヘルパーへ抽出し、成功/失敗の扱いが片方だけ退行しない構造にする。進捗テキストは両者とも `t('admin.posts.bulkProgress')` 系のキー経由に統一する（現状 :296 のみハードコード）。
- **FR-295-03（削除順序の反転と0行検知）**: `bulkDelete` は **DB DELETE を先に実行し、成功（削除行あり）を確認してから Storage remove を行う**順序に変更する。DB DELETE には単体 `deletePost` と同じ `.select('id')` を付与し、0 行なら失敗として扱う（RLS 拒否・既に不在の検知）。Storage remove の戻り値エラーも参照し、DB は消えたが写真が残る場合は「孤立ファイル」として `logError` で記録する（単体 `deletePost` :335-338 の方針と揃える）。**写真だけが先に消える経路を残さない。**
- **FR-295-04（審査キューの error state ＋ 再試行）**: `useAdminPosts` に `fetchError` state と `retry` を追加し、`AdminPostsPage` は `opError` バナー（`useAdminPosts.ts:170-172` 相当の位置）と同じ場所に「読み込みエラー＋再試行」を表示する。REQ-273 / REQ-192 の `LoadErrorState` と同型にする。**エラー時に `posts.length === 0` の空状態分岐（`AdminPostsPage.tsx:320-323`）へ落としてはならない。**
- **FR-295-05（審査待ち件数の失敗を0と区別）**: `fetchPendingCount`（:127-133）で `error` を destructure して参照し、取得失敗時はバッジを `0` にせず「取得できず」（`—` 等）として区別可能に表示する。
- **FR-295-06（AbortController の移植）**: 問題D の4箇所（`useAdminPosts.fetchPosts` / `AdminReportsPage.fetchReports` / `AdminCommentsPage.fetchComments` / `AdminUsersPage.fetchUsers`）へ `usePostList.ts:120-150` の abortRef ＋ `controller.signal.aborted` パターンを移植し、PostgREST 側にも `.abortSignal(controller.signal)` を付与する。aborted ガードは「応答後」「setState 前」「finally」の3点に置く（`usePostList` と同一方針）。
- **FR-295-07（管理エラーバウンダリの監視接続）**: `src/app/admin/error.tsx:15` の `console.error` を `logError(error, 'app/admin/error')` に置換し、Sentry へ到達させる。あわせて同ファイルの日本語ハードコード5箇所を i18n キー化し、dark テーマ対応を他 admin 画面に揃える。
- **FR-295-08（一括操作の同期ガード）**: `AdminPostsPage.tsx:93-103` の `handleBulkDelete` / `handleBulkApprove` の冒頭に REQ-223 FR-223-08 と同型の同期ガード（`if (bulkProcessing) return`）を追加する。
- **FR-295-09（回帰テスト）**: `src/hooks/admin/__tests__/useAdminPosts.test.ts` に次を追加する。(a) 一括承認が全件失敗したとき成功トーストを出さず失敗件数を提示する、(b) `bulkDelete` で DB DELETE が 0 行のとき Storage remove を呼ばない、(c) 取得失敗時に `fetchError` が立ち空状態にならない、(d) タブ切替後に先行クエリが後着しても一覧へ反映されない。

## 受入基準

- **AC-01**: ネットワーク遮断状態で `/admin/posts` を開くと「読み込みエラー＋再試行」が表示され、**「審査待ちの投稿はありません」や審査待ちバッジ0が表示されない**。再試行で復帰する。
- **AC-02**: 一括承認が全件失敗した場合、成功トーストは出ず「0件成功・N件失敗」相当が提示され、失敗した投稿は選択状態に残る。一部成功時は成功/失敗の件数が両方提示される。
- **AC-03**: 一括削除は DB DELETE の成功（削除行あり）を確認した後にのみ Storage remove を実行する。DB DELETE が RLS 拒否/0行の投稿について、Storage の写真が削除されていない。
- **AC-04**: `pending` タブ → `approved` タブへ素早く切り替えたとき、後着した `pending` クエリの結果が `approved` タブへ反映されない（FR-295-09(d) のテストで固定化）。
- **AC-05**: 管理画面内でエラーを発生させると `logError` 経由で Sentry へ送出される（`app/error.tsx` と同じ経路）。`app/admin/error.tsx` に日本語ハードコードが残っていない。
- **AC-06**: 一括承認/一括削除ボタンを連打しても処理が二重に走らない。
- **AC-07**: 追加した i18n キーが ja/en/ko/zh 4言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-08**: `lint` / `type-check` / 既存652テストがパスする。

## 備考（要確認）

- FR-295-03 の順序反転により、DB DELETE 成功後に Storage remove が失敗した場合は「孤立ファイル」が残る。これは写真だけが消える現状より安全側だが、孤立ファイルの掃除方針（定期ジョブ / 手動）は REQ-002（孤立写真）の扱いと整合させるか**要確認**。
- 問題B の修正で `fetchError` を導入する際、既存の `opError`（操作エラー）と表示位置・優先順位をどう分けるかは実装時に決める。本 REQ では「同じ場所に出す」までを要件とし、同時発生時の優先順位は**要確認**。
