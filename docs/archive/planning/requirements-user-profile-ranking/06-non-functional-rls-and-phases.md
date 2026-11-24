## 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | ランキングRPCは500ms以内で応答（キャッシュ5分） |
| セキュリティ | プロフィール編集は本人のみ（RLS）。メールアドレスは一切公開しない |
| アクセシビリティ | バッジにaria-label付与。色だけでなくテキストでも状態を伝える |
| レスポンシブ | モバイルファースト。統計は2カラムにスタック |
| データ整合性 | 既存ユーザーにはマイグレーションで `user_profiles` 行を一括生成 |

---

## RLS ポリシー

```sql
-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 全員が公開プロフィールを閲覧可
CREATE POLICY "public_profiles_are_viewable"
  ON user_profiles FOR SELECT
  USING (is_public = true);

-- 本人は自分のプロフィールを常に閲覧可
CREATE POLICY "own_profile_viewable"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- 本人のみ編集可
CREATE POLICY "own_profile_editable"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- user_badges（閲覧のみ）
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_are_viewable"
  ON user_badges FOR SELECT
  USING (true);

-- badge_definitions（閲覧のみ）
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badge_defs_are_viewable"
  ON badge_definitions FOR SELECT
  USING (true);
```

---

## 画面遷移

```
[ヘッダー] → [マイページアイコン] → [/profile]（自分のプロフィール）
                                      ├── [編集ボタン] → [編集モーダル]
                                      └── [投稿カード] → [/post/:id]

[ヘッダー] → [ランキングリンク] → [/ranking]
                                    └── [ユーザー名クリック] → [/profile/:userId]

[投稿カード] → [投稿者名クリック] → [/profile/:userId]（他人のプロフィール）
```

---

## 実装フェーズ

| フェーズ | 内容 | 優先度 |
|---------|------|-------|
| Phase A | DB テーブル作成 + 既存ユーザーマイグレーション + RLS | 高 |
| Phase B | プロフィールページ（自分）+ 編集モーダル | 高 |
| Phase C | バッジ定義 + 付与トリガー + プロフィールバッジ表示 | 中 |
| Phase D | ランキングページ + 期間フィルタ | 中 |
| Phase E | 投稿カード・DetailPage に投稿者リンク追加 | 低 |
| Phase F | 連続投稿バッジ（streak）判定ロジック | 低 |

---

## 依存・注意事項

- `auth.users` テーブルへのトリガーは Supabase Dashboard の SQL Editor で実行が必要（マイグレーションファイルでは `auth` スキーマへのアクセスに制限がある場合あり）
- 既存ユーザーへの `user_profiles` 一括INSERT は `INSERT INTO user_profiles (id) SELECT id FROM auth.users ON CONFLICT DO NOTHING` で実行
- 禁止ワードフィルタはフロントエンド + DB CHECK制約の二重チェック
- `get_user_ranking` は `STABLE` を指定し、PostgreSQL のクエリキャッシュを活用
- バッジ付与トリガーは投稿の UPDATE（承認時）のみ発火。過去分は初回マイグレーション時に一括付与スクリプトを実行
