## 受入条件

- [ ] **AC-135-01**: **Given** 認証ユーザー A、**When** Supabase client で `storage.from('post-photos').upload('${A.id}/x.webp', file)`、**Then** 成功し `image_hashes` も従来通り。
- [ ] **AC-135-02**: **Given** 認証ユーザー A、**When** `storage.from('post-photos').upload('${B.id}/poison.webp', file)`、**Then** RLS error で 403/400 相当（`new row violates row-level security policy`）。
- [ ] **AC-135-03**: **Given** 認証ユーザー A、**When** `storage.from('post-photos').upload('anon/poison.webp', file)`、**Then** RLS error。
- [ ] **AC-135-04**: **Given** 認証ユーザー A、**When** `storage.from('post-photos').upload('${A.id}/poison.exe', file)`、**Then** RLS error（拡張子違反）。
- [ ] **AC-135-05**: **Given** 認証ユーザー A、**When** `storage.from('post-audio').upload('${B.id}/poison.webm', file)`、**Then** RLS error。
- [ ] **AC-135-06**: **Given** 既存の正規アップロード経路（PostForm からの写真送信）、**When** ユーザーが投稿、**Then** 写真がアップロードされ posts.photos に URL が記録（回帰なし）。
- [ ] **AC-135-07**: **Given** `pg_policies` を migration 後に確認、**When** `SELECT with_check FROM pg_policies WHERE policyname='authenticated_upload'`、**Then** `storage.foldername(name)` と `auth.uid()` の比較式が含まれる。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260513000007_storage_owner_folder_upload.sql` | 新規。post-photos / post-audio の INSERT policy を folder ownership 付きで再作成 |
| `supabase/schema.sql` | L371-373 / L955-957 を新 policy に置換 |
| `supabase/tests/rls_storage.sql` | 新規。pg-tap 12 ケース（photos 6 + audio 6） |

### 他機能への影響

- フロント `src/lib/uploadPhoto.ts` / `src/lib/uploadAudio.ts`: 既に `${auth.uid()}/...` 形式なので変更不要（grep で確認）
- `analyze-image` / `analyze-audio` Edge Function: service_role 経由のため RLS bypass、影響なし
- admin 側の写真削除 (`owner_or_admin_delete_photos`): 変更なし
- REQ-079 / REQ-129 の hash dedup: INSERT が owner folder に限定されることで、攻撃者による hash collision 攻撃の前提が崩れ、本 REQ の副次的恩恵あり

## 優先度

- **緊急度**: **High**
- **重要度**: **High**
- **理由**:
  - 認証ユーザーであれば誰でも他人フォルダ・anon フォルダに書き込めるため、ストレージ濫用 / hash dedup 悪用 / 違法コンテンツ紐付け攻撃が成立
  - 本番バケットは public read のため、被害者ユーザー UUID 配下に置かれた違法画像が外部公開される最悪シナリオあり（評判リスク）
  - DELETE policy は既に owner / admin 制限が掛かっているため、INSERT 側だけが「片肺」の状態
  - 修正は migration 1 本 + schema.sql 数行で完結、コスト対効果が高い
  - REQ-133 / REQ-134 が「機密性 / 整合性」側の drift 修正なら、本 REQ は「ストレージ層の整合性」側の drift 修正であり、セットで対応するのが自然
