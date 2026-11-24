## API / データモデル仕様

### SQL 追加例（`supabase/schema.sql` に追記）
```sql
-- ===================================================
-- N. Storage バケット (post-audio) — REQ-070
-- ===================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-audio',
  'post-audio',
  true,
  1048576, -- 1MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_audio" ON storage.objects;
DROP POLICY IF EXISTS "public_read_audio"          ON storage.objects;
DROP POLICY IF EXISTS "owner_or_admin_delete_audio" ON storage.objects;

DO $$ BEGIN CREATE POLICY "authenticated_upload_audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'post-audio' AND name ~ '\.(webm|mp4|m4a|mp3|ogg)$'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "public_read_audio" ON storage.objects FOR SELECT USING (
  bucket_id = 'post-audio'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "owner_or_admin_delete_audio" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'post-audio'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR name LIKE concat(auth.uid()::text, '/%')
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### クライアント upload 関数シグネチャ案
```ts
// src/lib/uploadAudio.ts
export async function uploadAudio(blob: Blob, userId: string, mimeType: string): Promise<string> {
  const ext = mimeType === 'audio/webm' ? 'webm'
    : mimeType === 'audio/mp4'  ? 'm4a'
    : mimeType === 'audio/mpeg' ? 'mp3'
    : 'ogg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('post-audio').upload(path, blob, {
    cacheControl: '3600',
    contentType: mimeType,
  })
  if (error) throw error
  return supabase.storage.from('post-audio').getPublicUrl(path).data.publicUrl
}
```
