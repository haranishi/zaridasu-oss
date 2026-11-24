-- REQ-169: CI rls-tests 用の storage スキーマ最小スタブ。
-- Supabase ホストには存在するが plain postgres には無い storage スキーマ / storage.buckets /
-- storage.objects / storage.foldername / storage.extension を、テスト実行に必要な最小構成で再現する。
-- 本番スキーマ（schema.sql / migrations）には含めない CI 専用 fixture。
-- pg_prove の対象 glob（supabase/tests/*.sql）の外に置くことでテストとして実行されないようにしている。
--
-- REQ-330: CI はこのファイルを schema.sql より**前**に流す（.github/workflows/ci.yml rls-tests）。
--   これで schema.sql の写真置き場（post-photos / post-audio / rare-photos）の作成とポリシーが
--   エラーにならずに作られ、rare-photos の読み書きの制限を pg-tap で確かめられる。
--   既定 GRANT の後にもう一度流すが、全文が冪等なので結果は変わらない。

CREATE SCHEMA IF NOT EXISTS storage;

-- buckets: schema.sql / migration の `INSERT ... ON CONFLICT (id)` が通る最小構成。
--   本物は owner / created_at / avif_autodetection なども持つが、ここで使う列だけに留める。
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata   jsonb
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Supabase storage の補助関数の最小等価実装。
-- foldername: パスを '/' で分割し、ファイル名を除いたフォルダ部分の配列を返す
--   例) 'uid/ok.webp' -> {uid}（[1]='uid'） / 'rootfile.webp' -> {}（[1]=NULL）
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE _parts text[];
BEGIN
  _parts := string_to_array(name, '/');
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$func$;

-- extension: ファイル名末尾の拡張子（小文字化前の生値）を返す
--   例) 'uid/ok.webp' -> 'webp'
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE _parts text[]; _filename text;
BEGIN
  _parts := string_to_array(name, '/');
  _filename := _parts[array_length(_parts, 1)];
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$func$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;
