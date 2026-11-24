-- ===================================================
-- Google OAuth「Database error saving new user」エラー修正
--
-- 原因: handle_new_user() が display_name をそのまま挿入していたが、
--       user_profiles.display_name の CHECK 制約 (char_length BETWEEN 1 AND 20) により
--       Google アカウント名が20文字を超える場合に INSERT が失敗していた。
--
-- 修正: LEFT() で20文字に切り詰め、旧トリガーとの重複も解消。
-- ===================================================

-- 1. トリガー関数を修正（display_name を20文字に切り詰め）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_emoji)
  VALUES (
    NEW.id,
    LEFT(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        '名無し'
      ),
      20
    ),
    '🦞'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 旧トリガーを削除（マイグレーション版 handle_new_user_profile との重複解消）
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. 新しいトリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. 不要になった旧関数を削除
DROP FUNCTION IF EXISTS handle_new_user_profile();

-- 5. INSERT ポリシーが存在しない場合に追加（プロフィール自己作成用）
DO $$ BEGIN
  CREATE POLICY "own_profile_insertable" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
