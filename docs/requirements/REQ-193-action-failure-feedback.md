# REQ-193: ユーザー操作失敗時のフィードバック付与（無通知の解消）

## 背景
ザリダスには `ToastContext` が `src/context/ToastContext.tsx` で全画面へ提供されており、`toast.error()` / `toast.success()` を任意のコンポーネントから呼べる。しかし、いくつかのユーザー操作（いいね・コメント削除・調査協力・プロフィール保存）は、失敗時にエラーをログへ送る・state を再同期するだけで、ユーザーには**何のフィードバックも返さない**。結果として「タップしたのに何も起きない」「保存ボタンを押したらスピナーが止まっただけ」という、操作が成功したのか失敗したのか判別できない状態が発生する。

これは WCAG 4.1.3（ステータスメッセージ・AA）の趣旨にも反し、特に楽観的更新をロールバックするケースでは、画面上の変化が一瞬で巻き戻り、ユーザーは原因を理解できない。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **いいね toggle 失敗が無通知**
   - `src/hooks/useLike.ts:92-98` — `catch {}` ブロックで `likeCount`/`liked` をサーバ値へ再取得・再同期するのみ。例外時にトーストもエラー state も出さない。ユーザーから見るとタップしてもカウントが変わらず「反応しない」ように見える。

2. **コメント削除の楽観的ロールバックが無通知**
   - `src/components/features/posts/CommentSection.tsx:107-112` — `handleDelete` は楽観的に `setComments((c) => c.filter(...))` した後、`if (error) setComments(prev)`（111行）で巻き戻すだけ。削除が消えて元に戻るが、なぜ失敗したかの通知が無い。

3. **「協力する」ボタンの失敗が無通知**
   - `src/views/SurveyRequestPage.tsx:262-273` — 協力トグルの `onClick` 内 `catch (e) { logError(e as Error, 'SurveyRequestPage:respond') }`（269行）でログのみ。`responseSubmitting` を戻すだけで、ユーザーには成否が伝わらない。
   - （参考）同ファイルのコメント削除 `SurveyRequestPage.tsx:346-349` も `catch (e) { logError(...) }` のみで同様の無通知。

4. **プロフィール編集モーダルの保存失敗が無通知**
   - `src/views/DashboardPage.tsx:45-58`（`EditProfileModal.handleSave`、実利用される本体側）— `catch { setSaving(false) }`（55-57行）でスピナーを止めるだけ。エラー表示ゼロ。モーダルは開いたまま、ボタンが再び有効になるだけで、保存できたのか失敗したのか分からない。
   - 同型の死にコード `src/views/ProfilePage.tsx:58-61` も同じ `catch { setSaving(false) }`（REQ-194 で統合・削除予定だが、統合後の共通コンポーネントにも本要件のインラインエラーを実装すること）。

`DeleteAccountModal`（`DashboardPage.tsx:140-149`）はインラインエラー（191行 `setError`）を出しており、アプリ内に良い前例があるにもかかわらず、上記の操作には適用されていない。

## 目的
失敗し得るすべてのユーザー操作に対し、成否のフィードバックを必ず返す。一過性の操作（いいね・協力・コメント削除）はトースト通知、モーダル内フォーム（プロフィール編集）はモーダル内インラインエラーで提示し、ユーザーが「失敗したこと」と「再試行できること」を認識できるようにする。

## 要件
### 機能要件
- [ ] FR-193-01: `useLike.ts` の `toggleLike` の `catch`（92-98行）で、サーバ値への再同期に加えて失敗をユーザーへ通知する。フック単体でトーストへ依存させない設計とし、`toggleLike` 失敗を呼び出し側が検知できるよう「例外を再 throw する」か「`onError` コールバック/戻り値で失敗を通知する」かのいずれかを採用し、呼び出し側（`DetailPage` / `LikeShareSection` 等）で `toast.error(t('like.error'))` を表示する。
- [ ] FR-193-02: `CommentSection.tsx` の `handleDelete`（107-112行）で、ロールバック時に `toast.error(t('comment.deleteError'))` を表示する。
- [ ] FR-193-03: `SurveyRequestPage.tsx` の協力トグル `catch`（262-273行、269行）で `toast.error(t('survey.respondError'))` を表示する。コメント削除 `catch`（346-349行）でも `toast.error(t('survey.commentDeleteError'))` を表示する。
- [ ] FR-193-04: プロフィール編集モーダル（`DashboardPage.tsx` の `EditProfileModal`、および REQ-194 で共通化される後継コンポーネント）の `handleSave` `catch` で、`setSaving(false)` に加えてモーダル内インラインエラー（`DeleteAccountModal` の 190-192 行と同型の表示）を表示する。`onSave` 失敗時はモーダルを閉じない。
- [ ] FR-193-05: 上記すべてのエラー文言を ja/en/ko/zh の 4 ロケール i18n キーで定義する（例 `like.error`, `comment.deleteError`, `survey.respondError`, `survey.commentDeleteError`, `profile.saveError`）。
- [ ] FR-193-06: 成功時のフィードバックは過剰にならない範囲とする。いいね/協力は視覚的な状態変化で十分とし、プロフィール保存のみ任意で `toast.success(t('profile.saved'))` を出してよい（FR として成功トーストは必須にしない）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-193-01: トースト表示は既存 `ToastContext` の `toast.error` を使い、新規のトースト実装を増やさない。
- [ ] NFR-193-02: フック（`useLike`）は UI コンテキスト（Toast）に直接依存させず、テスト容易性のため失敗通知の手段（再 throw / コールバック）を呼び出し側へ委譲する。

## 受入条件
- [ ] AC-01: いいね toggle のクエリをモック失敗させると、呼び出し側でエラートーストが表示される（または `toggleLike` が失敗を通知する）ことをユニットテストで確認できる。
- [ ] AC-02: コメント削除をモック失敗させると、楽観的更新がロールバックされ、かつエラートーストが表示される（testing-library）。
- [ ] AC-03: 「協力する」操作をモック失敗させると、エラートーストが表示される（ユニットテスト）。
- [ ] AC-04: プロフィール保存（`onSave`）をモック失敗させると、モーダルが開いたまま・スピナーが止まり・インラインエラーが表示される（testing-library）。
- [ ] AC-05: 追加した全 i18n キーが ja/en/ko/zh の 4 ファイルに存在する。
- [ ] AC-06: 各操作の成功時には誤ってエラートーストが出ない（成功パスの回帰テスト）。

## 影響範囲
- フック: `src/hooks/useLike.ts`
- ビュー/コンポーネント: `src/views/SurveyRequestPage.tsx`、`src/views/DashboardPage.tsx`（EditProfileModal）、`src/components/features/posts/CommentSection.tsx`、`src/components/features/posts/LikeShareSection.tsx`（toggleLike 呼び出し側）、`src/views/DetailPage.tsx`（handleLike 経由）
- 共通資産: `src/context/ToastContext.tsx`（既存利用）
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`
- REQ-194 と連動（共通化後の EditProfileModal にインラインエラーを実装）
- 関連テスト: useLike / CommentSection / SurveyRequestPage / EditProfileModal のユニットテスト

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 操作の成否が分からないことはUXの基本的な欠落で、特に楽観的更新のロールバック時はユーザーを混乱させる。ToastContext が既に全画面提供済みで実装コストは低い。データ破壊は無いため致命ではないが、市民科学アプリの継続利用（投稿・協力の習慣化）に直結するため優先する。
