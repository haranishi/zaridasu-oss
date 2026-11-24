-- REQ-135: Storage INSERT が自分の uid フォルダ配下のみ許可されることを検証 (pg-tap)
--
-- 検証観点 (post-photos / post-audio それぞれ):
--   1) 自分の uid フォルダへの正規アップロードは成功
--   2) 他人 uid フォルダへの書き込みは policy で deny
--   3) anon/ や絶対パスっぽいフォルダへの書き込みは policy で deny
--   4) フォルダなし (ファイル直置き) は deny
--   5) 拡張子違反は deny
--   6) 拡張子大文字 (WEBP / WEBM) は lower(extension) で許可

BEGIN;
SELECT plan(12);

-- ===================================================
-- セットアップ: 2 ユーザー A, B
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('66666666-6666-6666-6666-666666666666', 'storage-a@test.local', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'storage-b@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- A として認証
SELECT set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}', true);
SET LOCAL ROLE authenticated;

-- ===================================================
-- post-photos
-- ===================================================
-- INV-01: A が自分のフォルダにアップロード OK
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', '66666666-6666-6666-6666-666666666666/ok.webp', '66666666-6666-6666-6666-666666666666')$$,
  'INV-01: A は自分の uid フォルダに post-photos をアップロード可'
);

-- INV-02: A が B のフォルダに書き込み → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', '77777777-7777-7777-7777-777777777777/poison.webp', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-02: A は B のフォルダに post-photos を書き込めない'
);

-- INV-03: anon/ フォルダへの書き込み → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', 'anon/poison.webp', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-03: A は anon/ フォルダに post-photos を書き込めない'
);

-- INV-04: フォルダなし (直置き) → deny (foldername(name)[1] != uid)
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', 'rootfile.webp', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-04: A はフォルダなしで post-photos を直置きできない'
);

-- INV-05: 拡張子違反 (.txt) → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', '66666666-6666-6666-6666-666666666666/bad.txt', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-05: A は .txt を post-photos にアップロードできない'
);

-- INV-06: 拡張子大文字 (.WEBP) → 許可 (lower(extension) で評価)
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-photos', '66666666-6666-6666-6666-666666666666/upper.WEBP', '66666666-6666-6666-6666-666666666666')$$,
  'INV-06: 拡張子大文字 .WEBP は lower 評価で許可される'
);

-- ===================================================
-- post-audio
-- ===================================================
-- INV-07: A が自分のフォルダに音声 OK
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', '66666666-6666-6666-6666-666666666666/ok.webm', '66666666-6666-6666-6666-666666666666')$$,
  'INV-07: A は自分の uid フォルダに post-audio をアップロード可'
);

-- INV-08: A が B のフォルダに音声 → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', '77777777-7777-7777-7777-777777777777/poison.webm', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-08: A は B のフォルダに post-audio を書き込めない'
);

-- INV-09: anon/ フォルダ音声 → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', 'anon/poison.webm', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-09: A は anon/ フォルダに post-audio を書き込めない'
);

-- INV-10: フォルダなし音声 → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', 'rootaudio.webm', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-10: A はフォルダなしで post-audio を直置きできない'
);

-- INV-11: 拡張子違反 (.exe) → deny
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', '66666666-6666-6666-6666-666666666666/bad.exe', '66666666-6666-6666-6666-666666666666')$$,
  '42501',
  NULL,
  'INV-11: A は .exe を post-audio にアップロードできない'
);

-- INV-12: 拡張子大文字 (.WEBM) → 許可
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('post-audio', '66666666-6666-6666-6666-666666666666/upper.WEBM', '66666666-6666-6666-6666-666666666666')$$,
  'INV-12: 拡張子大文字 .WEBM は lower 評価で許可される'
);

SELECT * FROM finish();
ROLLBACK;
