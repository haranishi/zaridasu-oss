# REQ-185: オフライン投稿の下書き保存で録音音声・調査依頼紐付け・位置取得手段がサイレント消失する

## 背景
ザリダスはオフライン環境（電波の弱い調査現場）でも投稿を作成できるよう、IndexedDB に下書きを退避し、オンライン復帰時にまとめて送信する仕組みを持つ。下書き保存は `src/hooks/usePostForm.ts` の `saveOffline`、IndexedDB のスキーマと CRUD は `src/lib/offlineStore.ts`、復帰時の再送は `src/hooks/useOfflineQueue.ts` の `sendOne` が担当する。

一方、通常のオンライン投稿（`usePostForm.ts` の `submitPost`、`:296-339`）は、録音済み音声（`audio_url` / `audio_hash` / `audio_duration_ms`）・調査依頼への返答リンク（`survey_request_id`）・位置取得手段（`location_source`）・調査手法（`survey_method` / `survey_site_id`）まで含めて `posts` に保存している。オフライン経路はこの一部しか保存・復元しないため、両経路で保存される情報量に乖離がある。

## 現状の問題
オフライン下書き保存・再送の経路で、ユーザーが入力・録音したデータの一部が**保存時にサイレントに脱落**し、ユーザーは「下書きに保存しました」という成功フィードバックだけを受け取る。脱落したことを知る術がない。

### 1. `saveOffline` が音声・依頼紐付け・位置取得手段等を `addPendingPost` に渡していない
`src/hooks/usePostForm.ts:392-410` の `addPendingPost` 呼び出しは、`formData` として次の項目のみを渡す。
```ts
// usePostForm.ts:392-410
await addPendingPost(
  {
    lat, lng, species, infoType, municipality, comment, count,
    observedAt, weather, temperature, humidity, surveyDurationMinutes,
    accuracy: postData.accuracy ?? null,
  },
  processedBlobs,   // 写真のみ。録音音声 audioBlob は渡されない
)
```
`submitPost` が保存している以下が**保存対象から完全に欠落**している。
- 録音音声: `audioBlob`（`usePostForm.ts:33` で state 保持。`submitPost` では `:276-291` で `uploadAudio` 経由で保存）
- `surveyRequestId`（`PostFormData.surveyRequestId`、`src/types/index.ts:75`。`submitPost` では `:336` で `survey_request_id` として保存）
- `locationSource`（`PostFormData.locationSource`、`src/types/index.ts:78`。`submitPost` では `:330` で `location_source` として保存）
- `surveyMethod` / `surveySiteId`（`PostFormData`、`src/types/index.ts:80-81`。`submitPost` では `:333-334` で保存）
- `audioDurationMs`（`usePostForm.ts:36` で state 保持。`submitPost` では `:308` で `audio_duration_ms` として保存）

### 2. `PendingPost` スキーマに音声・上記項目を格納する型がない
`src/lib/offlineStore.ts:9-32` の `PendingPost.formData` には上記カラムの型定義がなく、写真は `photos: Blob[]`（`:29`）として持つが**音声 Blob を持つフィールドが存在しない**。IndexedDB の `DB_VERSION` は `1`（`:5`）のまま。

### 3. 再送 `sendOne` の `insert` に当該カラムがない
`src/hooks/useOfflineQueue.ts:72-93` の `posts` への `insert` は、写真 URL（`:81`）までしか復元せず、`audio_url` / `audio_hash` / `audio_duration_ms` / `survey_request_id` / `location_source` / `survey_method` / `survey_site_id` を**一切セットしない**。仮に `PendingPost` に音声 Blob を持たせても、再送時に Storage へアップロードする処理（`src/lib/uploadAudio.ts` の `uploadAudio`）が呼ばれていない。

### 4. 調査依頼の `responded` 遷移が起きない（機能退行）
`survey_request_id` 付き投稿は、DB トリガー `posts_mark_survey_responded`（`supabase/migrations/20260425000002_survey_request_status_trigger.sql:18-21`、`AFTER INSERT ON posts`）が親 `survey_requests.status` を `open → responded` に遷移させる。オフライン経路では `survey_request_id` が脱落するため、**「調査依頼に応えたのにステータスが open のまま」**という不整合が起き、依頼者にもコミュニティにも返答が反映されない。

### 5. ユーザーへの警告がない
`saveOffline`（`usePostForm.ts:380-419`）は `addPendingPost` 成功時に `true` を返すのみで、脱落項目（特に録音済み音声）について**何の警告も出さない**。ユーザーはウシガエルの鳴き声を録音して下書き保存し、後で送信した投稿に音声が無いことに気づけない。

## 目的
オフライン下書き保存・再送の経路を、オンライン投稿（`submitPost`）と**情報欠落なく等価**にする。録音音声・調査依頼紐付け・位置取得手段・調査手法を IndexedDB に退避し、オンライン復帰時に音声 Storage アップロードを含めて完全復元する。復元不能な項目が残る間は、保存時にユーザーへ明示的に警告し、サイレントなデータ消失を排除する。

## 要件
### 機能要件
- [ ] FR-185-01: `PendingPost.formData`（`src/lib/offlineStore.ts:9-32`）に `surveyRequestId: string | null`・`locationSource`・`surveyMethod`・`surveySiteId: string | null`・`audioDurationMs: number | null` を追加し、`PostFormData`（`src/types/index.ts:62-82`）の対応フィールドと型整合を取る。
- [ ] FR-185-02: `PendingPost` に録音音声を格納するフィールド（例: `audioBlob: Blob | null` と `audioMimeType: string | null`）を追加する。IndexedDB は Blob を直接格納できるため、Base64 等への変換は行わない。
- [ ] FR-185-03: IndexedDB スキーマ版数 `DB_VERSION`（`src/lib/offlineStore.ts:5`）をインクリメントし、`upgrade` コールバックで既存レコードの後方互換マイグレーションを行う（新規フィールドは `null`/既定値で補完し、既存下書きが読めなくならないこと）。
- [ ] FR-185-04: `saveOffline`（`src/hooks/usePostForm.ts:380-419`）が、`audioBlob`・`audioMimeType`・`audioDurationMs`（state 由来）と `surveyRequestId`・`locationSource`・`surveyMethod`・`surveySiteId`（`postData` 由来）を `addPendingPost` に渡す。
- [ ] FR-185-05: `sendOne`（`src/hooks/useOfflineQueue.ts:51-112`）が、写真アップロードに加えて、`PendingPost` に音声 Blob があれば `src/lib/uploadAudio.ts` の `uploadAudio` で Storage へアップロードし、`audio_url` / `audio_hash` / `audio_duration_ms` を取得・セットする。音声アップロード失敗時は孤立ファイルを残さず（`deleteAudio` 相当）、当該下書きを `status: 'error'` にして次回再送可能な状態を保つ。
- [ ] FR-185-06: `sendOne` の `posts` への `insert`（`useOfflineQueue.ts:72-93`）に、`audio_url`・`audio_hash`・`audio_duration_ms`・`survey_request_id`・`location_source`・`survey_method`・`survey_site_id` を含め、`submitPost`（`usePostForm.ts:296-339`）と同一カラム集合で復元する。`survey_method` は `surveySiteId` 有無に応じて `submitPost:333` と同じ規則（サイト指定時 `structured`、それ以外 `surveyMethod ?? 'opportunistic'`）で決定する。
- [ ] FR-185-07: 復元不能・未対応の項目が残る場合（例: 段階的実装で音声未対応の期間）、`saveOffline` は保存自体は行いつつ、脱落する項目をユーザーに明示警告する（例: トーストやバナーで「録音した音声はオフライン下書きには保存されません」等）。完全対応後は、脱落が無いことを前提に警告を出さない。
- [ ] FR-185-08: 後方互換: スキーマ更新前に保存された既存下書き（音声・新カラムを持たない）も、`sendOne` で `null`/既定値として安全に送信できる（再送時に例外で停止しない）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-185-01: 下書き上限（`MAX_PENDING = 10`、`offlineStore.ts:7`）とストレージ残量チェック（`checkStorageQuota`、`:50-60`）は維持する。音声 Blob 追加により 1 件あたりのサイズが増えるため、容量不足時のエラーメッセージ（`:56`）が引き続き機能すること。
- [ ] NFR-185-02: 既存の送信排他制御（`sendingRef`、`useOfflineQueue.ts:28,116-117`）と進捗表示（`SendProgress`）を退行させない。

## 受入条件
- [ ] AC-01: オフライン状態で「音声つき・調査依頼に紐付いた」投稿を下書き保存し、オンライン復帰後に再送すると、作成された `posts` 行に `audio_url`（再生可能な URL）と `survey_request_id` の両方が揃う。
- [ ] AC-02: `survey_request_id` 付き下書きを再送すると、親 `survey_requests.status` が `open → responded` に遷移する（DB トリガー `posts_mark_survey_responded` が発火する）。
- [ ] AC-03: 再送後の `posts` 行が、`location_source`・`survey_method`・`survey_site_id`・`audio_duration_ms` を含め、同内容のオンライン投稿（`submitPost`）と同一のカラム集合・値で保存されている。
- [ ] AC-04: `fake-indexeddb`（`package.json` に導入済み、`src/hooks/__tests__/useOfflineQueue.test.ts:2` で `fake-indexeddb/auto` 使用）を用いたユニットテストで、(a) 音声 Blob を含む下書きの保存→取得→再送、(b) スキーマ旧版で保存した下書きの後方互換読み出し・再送、を検証する。
- [ ] AC-05: スキーマ未対応項目が残る段階では、音声つき下書き保存時にユーザー向け警告が表示される（完全対応後は表示されない）ことをテストで確認できる。
- [ ] AC-06: 既存の `src/hooks/__tests__/useOfflineQueue.test.ts` が引き続き通過し、`next build` と型チェックがエラーなく完了する。

## 影響範囲
- `src/lib/offlineStore.ts`（`PendingPost` スキーマ、`DB_VERSION`、`upgrade`/`addPendingPost`）
- `src/hooks/usePostForm.ts`（`saveOffline`、`:380-419`）
- `src/hooks/useOfflineQueue.ts`（`sendOne`、`:51-112`）
- `src/lib/uploadAudio.ts`（`uploadAudio`/`deleteAudio` の再利用。変更は不要見込み）
- `src/types/index.ts`（`PostFormData` との整合確認）
- `src/hooks/__tests__/useOfflineQueue.test.ts`（テスト追加）
- DB/トリガー（`supabase/migrations/20260425000002_survey_request_status_trigger.sql`。`responded` 遷移の回帰確認のみ。変更不要）

## 優先度
- **緊急度**: 高 / **重要度**: 高 / **理由**: 「下書きに保存しました」の成功フィードバックの裏で、現場で録音したウシガエル音声や調査依頼への返答リンクがサイレントに失われる。市民科学データ（特に音声証跡）とコミュニティの依頼応答という、アプリの中核価値を毀損するデータ損失であり、ユーザーが検知・回復できない。オフライン運用が前提の現場アプリとして看過できない。
