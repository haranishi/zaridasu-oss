## 背景

`post-photos` / `post-audio` バケットは公開バケットだが、アップロードは認証ユーザーのみに制限している。フロント側のアップロードフロー（`src/lib/uploadPhoto.ts` 等）はキー名を `${auth.uid()}/${filename}` 形式で生成しており、「ユーザー UUID 配下のフォルダにしか書かない」設計になっている。

しかし `storage.objects` の INSERT policy（`authenticated_upload`, `authenticated_upload_audio`）の `WITH CHECK` には **フォルダ名と auth.uid の一致チェックが無い**。`bucket_id` と「ファイル拡張子」しかチェックしていないため、クライアントが任意のキー名（例: `<victim-uuid>/foo.jpg`、`anon/foo.jpg`、`../../admin/poison.jpg` 等）を直接指定すれば、他人フォルダにファイルを書き込める。

DELETE 側は `owner_or_admin_delete_photos` で `name LIKE auth.uid() || '/%'` が掛かっており「他人ファイルは消せない」が、これは攻撃者にとってはむしろ好都合: **書き込み放題 + 被害者は消せない**（admin が手で消すしか復旧手段がない）。

## 現状の問題

### コード上の問題箇所

- `supabase/schema.sql:371-373` — post-photos INSERT policy:
  ```sql
  DO $$ BEGIN CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'post-photos' AND name ~ '\.(jpe?g|png|webp|heic)$'
  ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ```
- `supabase/schema.sql:955-957` — post-audio INSERT policy:
  ```sql
  DO $$ BEGIN CREATE POLICY "authenticated_upload_audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'post-audio' AND name ~ '\.(webm|mp4|m4a|mp3|ogg)$'
  ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ```
- `supabase/migrations/20240101000000_initial_schema.sql:566` も同様。
- 対照として **DELETE policy** はちゃんと auth.uid をチェックしている:
  ```sql
  CREATE POLICY "owner_or_admin_delete_photos" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'post-photos'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      OR name LIKE concat(auth.uid()::text, '/%')
    )
  );
  ```
  INSERT 側で同じガードが抜け落ちている。

### 攻撃シナリオ

1. 認証済み攻撃者 A が、被害者 B の UUID を知る（profile API / 公開ページ等から取得可能）
2. A の Supabase client から `storage.objects.upload('post-photos', '<B-uuid>/poison.webp', <malicious file>)` を実行
3. INSERT policy は `bucket_id='post-photos' AND name ~ '\.webp$'` のみチェック → 通る
4. B のフォルダにファイルが残り、B は DELETE policy で `name LIKE B-uuid || '/%'` を満たすので**自分で消せる**が、その存在に気づかない限り放置
5. さらに悪用:
   - **dedup 悪用**: REQ-079 / REQ-129 で `image_hashes` の dedup を実装している。攻撃者が事前に被害者の hash と衝突するファイルを被害者フォルダに置けば、後続の正規投稿が dedup スキップで AI 判定をバイパスできる
   - **ストレージ枯渇**: 1MB 制限の音声を `anon/` 配下にループで投げ込み、運用コストを圧迫
   - **公開バケット**: バケットは public read のため、攻撃者は他人フォルダに違法/不適切コンテンツを置き、外部公開 URL を作成可能（B のユーザー名で違法画像が紐づく形）

### 関連 REQ

- REQ-025: RLS ポリシー整理 — storage には触れていない
- REQ-070: post-audio バケット作成 REQ — 同じ脆弱な定義をそのまま採用
- REQ-079 / REQ-129: hash dedup の前提が本 REQ で守られないと破綻
