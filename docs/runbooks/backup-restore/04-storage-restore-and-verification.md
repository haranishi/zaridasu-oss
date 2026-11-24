## (d) Storage バケットの再作成 + ファイル投入

### D-1. バケット & ポリシーの再作成

`supabase/schema.sql` の適用で `post-photos` / `post-audio` と Storage ポリシーが
`INSERT ... ON CONFLICT DO NOTHING` で再作成される（`supabase/schema.sql:425-`, `:1530-`）。
新規プロジェクトでは §(f) のスキーマ適用で同時に済む。

### D-2. 実体ファイルの投入

リストア先プロジェクトの S3 接続キーを発行し（Dashboard → Storage → S3 Connection）、投入する。

```bash
AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key \
SUPABASE_PROJECT_REF=<restore-target-ref> \
SUPABASE_STORAGE_S3_ACCESS_KEY=... SUPABASE_STORAGE_S3_SECRET_KEY=... \
SUPABASE_STORAGE_S3_REGION=ap-northeast-1 \
  ./scripts/restore-storage.sh ./backups/zaridasu-storage-....tar.gz.age
```

- アーカイブ内は `<basename>/post-photos/...` `<basename>/post-audio/...` の階層。スクリプトが
  バケット単位で `aws s3 sync`（無ければ `rclone copy`）で投入する。
- **オブジェクトのキー（パス）を保ったまま**戻すので、`posts.photo_url` / `audio_url` の publicUrl が
  そのまま生きる（ドメイン/ref が変わる新規プロジェクトでは §(e) の URL 補正に注意）。

---

## (e) 復元後の整合チェック

リストアが「取りっぱなし」にならないよう、必ず突き合わせる（AC-05）。

### E-1. アプリ起動 + 表示

- ローカル: `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` をリストア先に向け `npm run dev`。
- ホーム / 地図 / 投稿詳細で投稿一覧・写真・音声プレイヤーが表示されることを目視。

### E-2. DB ⇄ Storage の URL 整合（リンク切れ検知）

`posts` の写真 / 音声 URL が指す実体が**バケットに存在するか**を確認する。代表的な確認:

```sql
-- 写真/音声 URL を持つ投稿数（リストア前後で件数が一致するか）
select
  count(*)                                   as total_posts,
  count(*) filter (where photo_url is not null) as with_photo,
  count(*) filter (where audio_url is not null) as with_audio
from posts;
```

- 上記件数がバックアップ元と一致し、かつ抜き取りで数件の `photo_url` / `audio_url` を実際にブラウザで
  開いて 200 が返ることを確認する（404 が出たら Storage 投入漏れ or パス不一致）。
- **ref が変わる新規プロジェクトに移行した場合**、`photo_url` 内のホスト（`<old-ref>.supabase.co`）が
  旧 ref のまま残る。アプリ側が publicUrl をその都度 `getPublicUrl` で再生成していれば問題ないが、
  DB に絶対 URL が保存されている場合は **`update posts set photo_url = replace(photo_url, '<old-ref>', '<new-ref>')`**
  のような補正が必要（実施前に必ず件数を `select` で確認）。移行時の必須チェック項目として記録すること。

### E-3. 整合チェックリスト

- [ ] テーブル件数（`posts` / `comments` / `survey_requests` 等）がバックアップ元と一致
- [ ] `post-photos` / `post-audio` / `rare-photos` / `water-report-photos` のオブジェクト数がエクスポート時の `file_count` と一致
- [ ] 抜き取り 5 件の写真 URL が 200 で開ける
- [ ] 抜き取り 3 件の音声 URL が 200 で再生できる
- [ ] 管理画面 `/admin/posts` がエラーなく開く（RLS / トリガーが効いている）

---
