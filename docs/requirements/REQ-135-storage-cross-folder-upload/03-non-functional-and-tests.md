### 非機能要件

- [ ] **NFR-135-01: 冪等性**
  migration を複数回実行しても無害（`DROP POLICY IF EXISTS` で担保）。

- [ ] **NFR-135-02: 後方互換**
  正規アップロードフロー（`${auth.uid()}/<hash>.webp`）は引き続き成功。挙動変化なし。

- [ ] **NFR-135-03: パフォーマンス**
  `storage.foldername` / `storage.extension` は immutable 関数で `WITH CHECK` 内で実行されるが、単一 row 評価のため誤差レベル（< 0.1ms 増）。

### テスト要件

- [ ] **FR-135-05: pg-tap テスト追加**
  ファイル: `supabase/tests/rls_storage.sql`（新規）
  シナリオ:
  1. 認証ユーザー A が `A-uuid/test.webp` を INSERT → 成功
  2. 認証ユーザー A が `B-uuid/poison.webp` を INSERT → policy violation
  3. 認証ユーザー A が `anon/poison.webp` を INSERT → policy violation
  4. 認証ユーザー A が `test.webp`（フォルダなし）を INSERT → policy violation（`foldername(name)[1]` が NULL になり一致しない）
  5. 認証ユーザー A が `A-uuid/test.txt` を INSERT → 拡張子違反
  6. 認証ユーザー A が `A-uuid/test.WEBP` を INSERT → `lower(extension)` で成功
  7. post-audio 側も同様に 1〜5 をミラー実装

- [ ] **FR-135-06: E2E 回帰確認**
  `tests/e2e/`（既存 Playwright）で「写真投稿 → 投稿成功 → image_hashes に hash が入る」フローが pass し続けること。
