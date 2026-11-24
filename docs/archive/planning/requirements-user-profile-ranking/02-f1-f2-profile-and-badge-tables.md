## 機能要件

### F1: ユーザープロフィールテーブル（DB）

`user_profiles` テーブルを新設。`auth.users` とは 1:1 で紐づく。

```sql
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,                    -- ニックネーム（NULL時は「名無し調査員」）
  avatar_emoji  TEXT DEFAULT '🦞',       -- プロフィール絵文字アイコン
  bio           TEXT,                    -- 自己紹介（100文字以内）
  is_public     BOOLEAN DEFAULT true,    -- ランキングに表示するか
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

**設計判断**: Supabase の `auth.users` にカスタムカラムを追加せず、別テーブルで管理。理由:
- `auth.users` はSupabase管理下でマイグレーションの影響を受けやすい
- RLS を独立して設定できる
- 将来の拡張（アバター画像など）に柔軟

**自動作成**: `auth.users` に INSERT があったときトリガーでデフォルト行を作成。

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### F2: バッジシステム（DB）

```sql
CREATE TABLE badge_definitions (
  id          TEXT PRIMARY KEY,          -- 例: 'first_post', 'posts_10'
  name        TEXT NOT NULL,             -- 「初投稿」「10件達成」
  description TEXT NOT NULL,             -- 取得条件の説明
  icon        TEXT NOT NULL,             -- 絵文字アイコン
  category    TEXT NOT NULL,             -- 'posting', 'quality', 'community', 'special'
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE user_badges (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT REFERENCES badge_definitions(id),
  earned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
```

**初期バッジ一覧**:

| ID | 名前 | アイコン | カテゴリ | 条件 |
|---|---|---|---|---|
| `first_post` | はじめての投稿 | 🌱 | posting | 初めて投稿が承認された |
| `posts_10` | 調査員 | 🔍 | posting | 承認済み投稿10件 |
| `posts_50` | ベテラン調査員 | 🏅 | posting | 承認済み投稿50件 |
| `posts_100` | マスター調査員 | 🏆 | posting | 承認済み投稿100件 |
| `multi_species` | 両生類ハンター | 🐸 | quality | americanとbullfrog両方を投稿 |
| `multi_municipality` | 広域調査員 | 🗺️ | quality | 3つ以上の市区町村で投稿 |
| `first_comment` | コメンテーター | 💬 | community | 初めてコメントした |
| `absence_reporter` | 不在確認員 | ✅ | special | 不在確認を5件以上投稿 |
| `ai_perfect` | AI太鼓判 | 🤖 | quality | confidence 0.95以上で自動承認 |
| `streak_7` | 週間調査 | 🔥 | posting | 7日連続で投稿 |

