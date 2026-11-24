## 受入条件
- [ ] AC-070-01: **Given** `supabase/schema.sql` を本番 Supabase で実行、**When** Supabase Dashboard → Storage を開く、**Then** `post-audio` バケットが存在し、public = true、size limit = 1MB、MIME 4 種許可が反映されている。
- [ ] AC-070-02: **Given** 未認証（anon）クライアント、**When** `post-audio` バケットに upload を試みる、**Then** 401/403 で失敗する（`authenticated_upload_audio` ポリシー適用）。
- [ ] AC-070-03: **Given** 認証ユーザー A（uuid=aaa）、**When** `bbb/xxx.webm`（他人のフォルダ）に upload を試みる、**Then** INSERT は通るが DELETE は他者が実行できない。削除テストで `name LIKE concat(auth.uid()::text, '/%')` 条件により 403 を返す。
- [ ] AC-070-04: **Given** 音声アップロード成功後、posts テーブルへの INSERT が失敗（例: レートリミット引っかかり）、**When** `usePostForm` の catch 節が動く、**Then** `post-audio` の該当オブジェクトが `storage.remove` で削除される（孤立ファイル 0 件）。
- [ ] AC-070-05: **Given** 1.5 MB の音声 Blob、**When** アップロードする、**Then** Supabase が `413 Payload Too Large` を返し、クライアントがユーザーに「録音サイズが大きすぎます」トーストを表示する。
- [ ] AC-070-06: pg-tap または Vitest + supabase-js の統合テストで RLS 4 ケース（anon 不可 / auth 可 / 他者 delete 不可 / admin delete 可）を検証。

## 影響範囲
- 変更: `supabase/schema.sql`（バケット追加 + ポリシー 3 本）
- 新規: `src/lib/uploadAudio.ts`
- 変更: `src/hooks/usePostForm.ts`（孤立クリーンアップ）
- ドキュメント: `docs/SUPABASE_SETUP.md`（存在すれば追記）
- テスト: `src/__tests__/storage-audio-rls.test.ts`（統合）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: REQ-069 で録音した音声の保管先。本要件が無いと REQ-071 の audio_url に入れる URL を生成できない。
