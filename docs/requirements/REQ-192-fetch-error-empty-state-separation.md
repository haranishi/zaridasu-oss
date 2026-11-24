# REQ-192: フェッチ失敗と空状態の分離（エラー状態 + 再試行導線）

## 背景
ザリダスの主要画面（投稿詳細・調査依頼詳細・ランキング/多様性・プロフィール・コメント）では、Supabase からのデータ取得が失敗した際にエラーをログへ送るだけで握りつぶし、UI 上は「見つかりません」または「データがありません」という空状態にフォールバックしている。これにより、一時的なネットワーク障害や RPC の失敗が「その投稿/依頼は存在しない」「まだ記録がない」という**誤情報**としてユーザーに提示される。さらにリトライ導線が無いため、ユーザーは画面リロードや SPA 再遷移以外に回復手段を持たない。

一方で `usePostList`（ホーム一覧）は取得失敗時にトースト通知を出しており、エラー処理の方針がアプリ内で統一されていない。

WCAG 観点では直接の違反ではないが、「取得失敗」と「データ無し」を区別できないことはユーザーへの誤った情報提示であり、信頼性・回復性の問題である。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **投稿詳細のフェッチ失敗が「投稿が見つかりません」に化ける**
   - `src/views/DetailPage.tsx:108-109` — Client 側 fallback fetch の `if (error) { logError(error, 'DetailPage:fetchPost') }` でエラーをログのみ。`post` は `null` のまま。
   - `src/views/DetailPage.tsx:156-166` — `if (!post)` で `t('detail.notFound')`（160行「投稿が見つかりません」）を表示。取得失敗もこの空状態に合流する。再試行ボタンは無く、トップへのリンクのみ。

2. **調査依頼詳細のフェッチ失敗が「依頼が見つかりません」に化ける**
   - `src/hooks/useSurveyRequests.ts:179-186` — `useSurveyRequest` の `catch` で `console.error('[useSurveyRequest] fetch failed:', err)`（182行）の後 `setRequest(null)` のみ。エラー状態を呼び出し側へ返していない（戻り値 `UseSurveyRequestResult` に `error` フィールドが無い）。
   - `src/views/SurveyRequestPage.tsx:122-132` — `if (!request)` で `t('survey.notFound')`（127行「依頼が見つかりません」相当）を表示。取得失敗もここに合流。

3. **ランキング/多様性のフェッチ失敗が「まだ記録がありません」に化ける**
   - `src/hooks/useProfile.ts:92-99`（`useRanking`）— `setRanking(error ? [] : (data as RankingEntry[]) ?? [])`（98行）で error を空配列に握りつぶし。戻り値 `UseRankingResult` に `error` が無い。
   - `src/hooks/useProfile.ts:134-138`（`useDiversity`）— `setDiversity(error ? [] : ...)`（135行）で同様。戻り値 `UseDiversityResult` に `error` が無い。
   - `src/views/RankingPage.tsx:141-146` — `diversity.length === 0` で「まだ記録がありません」を表示。
   - `src/views/RankingPage.tsx:218-222` — `ranking.length === 0` で「まだランキングデータがありません」を表示。いずれも取得失敗と区別不能・再試行不可。

4. **コメント取得の失敗が「コメントはまだありません」に化ける**
   - `src/components/features/posts/CommentSection.tsx:58-66` — `fetchComments` が `if (!error) setComments((data as CommentRecord[]) || [])`（65行）。失敗時は何もせず、`comments` は初期値（空）のまま。エラー state を持たない。
   - `src/components/features/posts/CommentSection.tsx:126-127` — `comments.length === 0` で `t('comment.noComments')`（127行「コメントはまだありません」）を表示。取得失敗もここに合流。

5. **プロフィール取得の扱いは部分的に良好だが画面側で未活用**
   - `src/hooks/useProfile.ts`（`useProfile`、26-43行）は `error` を state で保持し戻り値にも含むが、`src/views/ProfilePage.tsx:160` では `const { profile, loading, updateProfile } = useProfile(targetUserId)` と `error` を分割代入しておらず、`ProfilePage.tsx:192-209` の `if (!profile)` 空状態（205行「プロフィールが見つかりません」）に取得失敗が合流する。フックが返すエラーが画面で捨てられている。

結果として、一時的なネットワーク障害・RPC タイムアウト・RLS による空応答などが、すべて「存在しない／まだ無い」という確定的な誤表示になり、ユーザーは回復手段（再試行）を得られない。

## 目的
データ取得の「失敗（エラー）」と「成功したが結果が空（空状態）」を UI 上で明確に分離する。失敗時には誤情報ではなく「読み込みに失敗しました」というエラー状態と再試行ボタンを提示し、ユーザーが操作のみで回復できるようにする。アプリ全体のエラー処理方針を `usePostList` 相当へ寄せて統一する。

## 要件
### 機能要件
- [ ] FR-192-01: `useSurveyRequest`（`useSurveyRequests.ts`）・`useRanking`・`useDiversity`（`useProfile.ts`）の各フックの戻り値に `error: string | null` を追加し、取得失敗時に `console.error`/握りつぶしではなくエラーメッセージを state へ保持して返す。`useProfile` は既存の `error` を維持する。
- [ ] FR-192-02: `CommentSection.tsx` の `fetchComments` を、失敗時に専用のエラー state（例 `fetchError`）へ設定するよう変更し、`if (!error) setComments(...)` の暗黙握りつぶしを廃止する。
- [ ] FR-192-03: 各画面（`DetailPage.tsx` / `SurveyRequestPage.tsx` / `RankingPage.tsx` / `ProfilePage.tsx` / `CommentSection.tsx`）で、レンダリング分岐を「読み込み中」「エラー状態（取得失敗）」「空状態（取得成功かつ 0 件/null）」「正常」の 4 状態に分離する。エラー状態は空状態の文言（notFound / noComments / まだ記録がありません 等）を流用しない。
- [ ] FR-192-04: エラー状態には**再試行ボタン**を表示し、クリックで該当フックの再フェッチ関数（`fetchRequest` / `refetch` / 再実行用コールバック / `fetchComments`）を呼び出す。`useRanking`・`useDiversity` には再フェッチを呼べる公開 API（例 `refetch`）を追加する。
- [ ] FR-192-05: DetailPage の Client fallback fetch（`DetailPage.tsx:108-109`）の失敗を `post=null` とは別のエラー state で表現し、FR-192-03/04 のエラー状態へ反映する。
- [ ] FR-192-06: エラー状態・空状態・再試行ボタンの全文言を ja/en/ko/zh の 4 ロケール i18n キーで定義する（例 `common.loadError`, `common.retry`）。ハードコード日本語を追加しない。
- [ ] FR-192-07: エラー状態の表示には既存の共通資産（`src/components/ui/ErrorAlert.tsx`）またはトースト（`ToastContext`）を用い、画面ごとに独自スタイルを増やさない。`usePostList` のトースト方針と矛盾しない形にする。

### 非機能要件（該当する場合のみ）
- [ ] NFR-192-01: 既存のリクエストキャンセル（`AbortController` / `signal?.aborted`）を維持し、アンマウント後やアボート時にエラー state を立てない（ユーザー起因でないキャンセルをエラー表示しない）。
- [ ] NFR-192-02: フック戻り値の型拡張（`error` 追加）により、呼び出し側で未使用でも型エラーにならない後方互換な形にする。

## 受入条件
- [ ] AC-01: 各フック（`useSurveyRequest` / `useRanking` / `useDiversity`）の戻り値に `error` が存在し、Supabase クエリ/RPC をモックで失敗させると `error` が非 null になる（ユニットテスト）。
- [ ] AC-02: 各画面で取得をモック失敗させると「読み込みに失敗しました」系のエラー UI（再試行ボタン付き）が表示され、空状態文言（notFound / noComments 等）は表示されない（testing-library）。
- [ ] AC-03: エラー UI の再試行ボタンをクリックすると、対応する再フェッチ関数が呼ばれ、モックを成功応答に切り替えると正常データが描画される（ユニットテスト）。
- [ ] AC-04: 取得が成功して結果が 0 件/null の場合は従来どおり空状態（notFound / noComments / まだ記録がありません）が表示され、再試行ボタンは出ない（エラー状態と空状態の分離が確認できる）。
- [ ] AC-05: 追加した全 i18n キーが ja/en/ko/zh の 4 ファイルに存在する（キー網羅テストまたは grep）。
- [ ] AC-06: アボート（アンマウント）時にはエラー state が立たない（signal.aborted 経路のテスト）。

## 影響範囲
- フック: `src/hooks/useSurveyRequests.ts`（`useSurveyRequest`）、`src/hooks/useProfile.ts`（`useRanking` / `useDiversity` / 戻り値型）
- ビュー: `src/views/DetailPage.tsx`、`src/views/SurveyRequestPage.tsx`、`src/views/RankingPage.tsx`、`src/views/ProfilePage.tsx`
- コンポーネント: `src/components/features/posts/CommentSection.tsx`
- 共通資産: `src/components/ui/ErrorAlert.tsx` / `src/context/ToastContext.tsx`（表示手段として利用）
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`
- 関連テスト: 各フック/ビューのユニットテスト

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 一時的障害が「存在しない/記録なし」という誤情報として確定的に提示され、ユーザーが回復手段を失う点でデータ信頼性とUXに実害がある。ただしデータ自体の破壊は無く、リロードで回避可能なため致命的ではない。複数フック/画面にまたがる横断改修のため中程度とする。
