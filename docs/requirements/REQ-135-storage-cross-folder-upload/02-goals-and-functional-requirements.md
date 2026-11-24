## 目的

- `post-photos` / `post-audio` の INSERT policy に **フォルダ名 = `auth.uid()::text` 一致** チェックを追加
- 既存の DELETE policy と対称の防御線を構築
- 拡張子チェックを `storage.extension` ベースに強化（preserved）

## 要件

### 機能要件

- [ ] **FR-135-01: 新規 migration の追加**
  ファイル: `supabase/migrations/20260513000007_storage_owner_folder_upload.sql`
  ```sql
  BEGIN;

  -- ============================================================
  -- post-photos
  -- ============================================================
  DROP POLICY IF EXISTS "authenticated_upload" ON storage.objects;
  CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'post-photos'
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic')
    );

  -- ============================================================
  -- post-audio
  -- ============================================================
  DROP POLICY IF EXISTS "authenticated_upload_audio" ON storage.objects;
  CREATE POLICY "authenticated_upload_audio" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'post-audio'
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND lower(storage.extension(name)) IN ('webm', 'mp4', 'm4a', 'mp3', 'ogg')
    );

  COMMIT;
  ```
  - `storage.foldername(name)` は `name` を `/` で分割した配列を返す Supabase 標準関数。`[1]` が一段目フォルダ
  - `storage.extension(name)` は拡張子のみ抽出（regex より誤検知が少ない）

- [ ] **FR-135-02: `supabase/schema.sql` の同期**
  `supabase/schema.sql:371-373` と `:955-957` の policy を上記と同等の定義に置換。

- [ ] **FR-135-03: 既存オブジェクトの監査**
  migration 適用前に以下を実行し、現状他人フォルダ書き込みがあるかチェック:
  ```sql
  SELECT bucket_id, owner, (storage.foldername(name))[1] AS folder, count(*)
  FROM storage.objects
  WHERE bucket_id IN ('post-photos', 'post-audio')
    AND owner IS NOT NULL
    AND (storage.foldername(name))[1] != owner::text
  GROUP BY 1, 2, 3
  ORDER BY count DESC;
  ```
  検出された不正なオブジェクトは別途運用判断（削除 / 通報）。本 REQ では検出のみで OK。

- [ ] **FR-135-04: フロント側の整合確認**
  `src/lib/uploadPhoto.ts` / `src/lib/uploadAudio.ts` 等の upload key 生成箇所を grep し、必ず `${auth.uid()}/...` で始まっていることを確認。違反箇所があれば本 REQ に修正範囲として含める（grep して該当なしなら触らない）。
