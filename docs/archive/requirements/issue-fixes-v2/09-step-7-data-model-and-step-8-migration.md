## Step 7: データモデル・DB設計

### マイグレーション対象

#### テーブル: posts（既存）
変更なし（スキーマは変更せず、RLS ポリシーのみ変更）

**RLS ポリシー変更:**
- DROP: `public_insert` （全ユーザー INSERT 許可）
- KEEP: `auth_insert` （認証ユーザーのみ INSERT 許可）
- KEEP: 他の全ポリシー（public_read, owner_update, owner_delete, admin_all_posts）

---

## Step 8: マイグレーション計画

### Migration-001: RLSポリシー整理
- **変更種別:** RLS ポリシー変更
- **SQL:**
  ```sql
  -- Up
  DROP POLICY IF EXISTS "public_insert" ON posts;

  -- Down (ロールバック)
  CREATE POLICY "public_insert" ON posts FOR INSERT WITH CHECK (true);
  ```
- **影響範囲:** 未認証ユーザーの直接 INSERT が不可になる（既存の匿名投稿機能は auth_insert + is_anonymous で動作するため影響なし）
- **ダウンタイム:** なし（ポリシー変更は即座に反映）

---
