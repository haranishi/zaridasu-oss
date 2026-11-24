-- Isolated fixture tests: never touch production. CI discovers this file through pg_prove.
BEGIN;
SELECT no_plan();
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
 ('11118888-1111-4111-8111-111111111111', 'water-a@test.local', '{}'),
 ('22228888-2222-4222-8222-222222222222', 'water-b@test.local', '{}'),
 ('33338888-3333-4333-8333-333333333333', 'water-admin@test.local', '{"role":"admin"}'),
 ('44448888-4444-4444-8444-444444444444', 'water-hour@test.local', '{}'),
 ('55558888-5555-4555-8555-555555555555', 'water-total@test.local', '{}');
CREATE FUNCTION _water_as(uid text, admin boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated',
 'app_metadata',CASE WHEN admin THEN '{"role":"admin"}'::json ELSE '{}'::json END)::text,true); END; $$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _water_as(text, boolean) TO PUBLIC;

SELECT ok(NOT has_table_privilege('anon','public.water_reports','SELECT,INSERT,UPDATE,DELETE'), 'anon has no report grants');
SELECT ok(NOT has_table_privilege('authenticated','public.water_reports','UPDATE'), 'direct report updates are revoked');
SELECT ok(NOT has_table_privilege('authenticated','public.community_water_bodies','INSERT,UPDATE,DELETE'), 'public projection is read only');
SELECT ok(NOT has_function_privilege('anon','public.review_water_report(uuid,text,text)','EXECUTE'), 'anon cannot execute review');
SELECT ok(NOT has_function_privilege('authenticated','public.check_water_report_input()','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.check_water_report_rate_limit()','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.delete_water_report_publication()','EXECUTE'), 'trigger helpers have no direct execute grant');
SELECT is((SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='community_water_bodies'),
 'id,name,lat,lng,created_at', 'public projection contains no report, owner, note or photos');
SELECT ok((SELECT NOT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg'] FROM storage.buckets WHERE id='water-report-photos'), 'photos bucket is private JPEG only, capped at 5MB');

SELECT set_config('request.jwt.claims','{}',true); SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM water_reports','42501',NULL,'anon cannot read reports');
SELECT lives_ok('SELECT * FROM community_water_bodies','anon can read public projection');
RESET ROLE;
SELECT _water_as('11118888-1111-4111-8111-111111111111'); SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO water_reports(id,user_id,client_id,name,note,lat,lng,photo_paths,created_at)
 VALUES('aaaabbbb-0000-4000-8000-000000000001','11118888-1111-4111-8111-111111111111','aaaabbbb-0000-4000-8000-000000000011','元の名前','非公開の補足',39.7123456,140.1234567,
 ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'],'2000-01-01')$$,'owner can submit private report');
SELECT is((SELECT status FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'),'pending','new report is pending');
SELECT ok((SELECT created_at=now() FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'),'client cannot backdate rate accounting');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('22228888-2222-4222-8222-222222222222',gen_random_uuid(),'偽装',39.7,140.1,ARRAY['22228888-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'42501',NULL,'cannot submit as another owner');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths,status,reviewed_at)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'偽装',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'],'rejected',now())$$,'42501',NULL,'cannot forge review state');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths,public_name)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'偽装',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'],'勝手な公開名')$$,'42501',NULL,'cannot forge checked public name');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'別人写真',39.7,140.1,ARRAY['22228888-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'42501',NULL,'cannot attach another owner photo');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'写真なし',39.7,140.1,'{}')$$,'23514',NULL,'at least one photo is required');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'  ',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23514',NULL,'blank names are rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),repeat('池',81),39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23514',NULL,'names above 80 characters are rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,note,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'池',repeat('補',1001),39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23514',NULL,'notes above 1000 characters are rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'池',91,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23514',NULL,'invalid latitude is rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'池',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg','11118888-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg','11118888-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg','11118888-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg'])$$,'23514',NULL,'more than three photos is rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111',gen_random_uuid(),'重複写真',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg','11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23514',NULL,'same photo cannot satisfy mandatory evidence twice');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths)
 VALUES('11118888-1111-4111-8111-111111111111','aaaabbbb-0000-4000-8000-000000000011','再送',39.7,140.1,ARRAY['11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'23505',NULL,'retry UUID cannot create a duplicate');
SELECT throws_ok($$UPDATE water_reports SET status='accepted' WHERE id='aaaabbbb-0000-4000-8000-000000000001'$$,'42501',NULL,'owner cannot update review state directly');
SELECT throws_ok($$INSERT INTO community_water_bodies(name,lat,lng) VALUES('偽の水域',39.7,140.1)$$,'42501',NULL,'ordinary users cannot forge public water');
SELECT throws_ok($$SELECT review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted','池')$$,'42501',NULL,'ordinary user cannot call review');
SELECT set_config('request.jwt.claims','{"sub":"11118888-1111-4111-8111-111111111111","role":"authenticated","user_metadata":{"role":"admin"}}',true);
SELECT throws_ok($$SELECT review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted','池')$$,'42501',NULL,'user_metadata admin spoof cannot review');

SELECT _water_as('11118888-1111-4111-8111-111111111111');
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id,name,owner) VALUES('water-report-photos','11118888-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg','11118888-1111-4111-8111-111111111111')$$,'owner can upload JPEG in own folder');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('water-report-photos','22228888-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg')$$,'42501',NULL,'cannot upload into another folder');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('water-report-photos','11118888-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png')$$,'42501',NULL,'cannot bypass JPEG-only photo path');
SELECT _water_as('22228888-2222-4222-8222-222222222222');
SELECT is((SELECT count(*)::int FROM water_reports),0,'other user sees no private report');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='water-report-photos'),0,'other user sees no private photo');
SELECT lives_ok($$DELETE FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'$$,'other owner delete affects zero rows');
SELECT lives_ok($$DELETE FROM storage.objects WHERE bucket_id='water-report-photos'$$,'other owner photo delete affects zero rows');
SELECT lives_ok($$INSERT INTO water_reports(id,user_id,client_id,name,lat,lng,photo_paths) VALUES('aaaabbbb-0000-4000-8000-000000000002','22228888-2222-4222-8222-222222222222',gen_random_uuid(),'B池',39.8,140.2,ARRAY['22228888-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'])$$,'second owner can submit');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'),1,'other owner could not delete report');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='water-report-photos'),1,'other owner could not delete photo');

SELECT _water_as('33338888-3333-4333-8333-333333333333',true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM water_reports),2,'administrator can read private reports');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='water-report-photos'),1,'administrator can read private photo');
SELECT throws_ok($$SELECT review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted',NULL)$$,'22023',NULL,'acceptance requires checked public name');
SELECT throws_ok($$SELECT review_water_report('aaaabbbb-0000-4000-8000-000000000001','pending','池')$$,'22023',NULL,'review cannot reset to pending');
SELECT ok(review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted',' 確認済み池 '),'admin accepts report');
SELECT is((SELECT name FROM community_water_bodies),'確認済み池','checked public name is normalized');
SELECT is((SELECT lat::text||','||lng::text FROM community_water_bodies),'39.712,140.123','only coarse coordinates are published');
SELECT is((SELECT public_name FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'),'確認済み池','checked name is retained separately');
SELECT is((SELECT count(*)::int FROM audit_logs WHERE action='review_water_report' AND target_id='aaaabbbb-0000-4000-8000-000000000001'),1,'review audit is committed');
SELECT ok(review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted','修正名'),'repeated review updates existing projection');
SELECT is((SELECT count(*)::int FROM community_water_bodies),1,'review retry does not duplicate public water');
SELECT ok(review_water_report('aaaabbbb-0000-4000-8000-000000000001','rejected'),'admin can retract accepted report');
SELECT is((SELECT count(*)::int FROM community_water_bodies),0,'rejection removes public projection atomically');
SELECT is((SELECT public_name FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'),'修正名','retraction retains checked name for rereview');
SELECT ok(NOT review_water_report('aaaabbbb-0000-4000-8000-000000000099','rejected'),'missing target returns false');
RESET ROLE;
ALTER TABLE audit_logs ADD CONSTRAINT water_test_block_audit CHECK (action <> 'review_water_report') NOT VALID;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT review_water_report('aaaabbbb-0000-4000-8000-000000000002','accepted','失敗池')$$,'23514',NULL,'failed audit rejects entire review');
RESET ROLE;
ALTER TABLE audit_logs DROP CONSTRAINT water_test_block_audit;
SELECT is((SELECT status FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000002'),'pending','failed audit rolled back private review');
SELECT is((SELECT count(*)::int FROM community_water_bodies),0,'failed audit rolled back public projection');
SET LOCAL ROLE authenticated;
SELECT ok(review_water_report('aaaabbbb-0000-4000-8000-000000000001','accepted','削除予定池'),'reaccept works');
SELECT _water_as('11118888-1111-4111-8111-111111111111');
SELECT lives_ok($$DELETE FROM water_reports WHERE id='aaaabbbb-0000-4000-8000-000000000001'$$,'owner can withdraw report');
SELECT is((SELECT count(*)::int FROM community_water_bodies),0,'report withdrawal removes public projection');
SELECT lives_ok($$DELETE FROM storage.objects WHERE bucket_id='water-report-photos'$$,'owner can delete own photo');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='water-report-photos'),0,'owner photo deletion actually removed object');

SELECT _water_as('44448888-4444-4444-8444-444444444444'); SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) SELECT '44448888-4444-4444-8444-444444444444',gen_random_uuid(),'上限池',39.7,140.1,ARRAY['44448888-4444-4444-8444-444444444444/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] FROM generate_series(1,20)$$,'20 hourly reports are allowed');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) VALUES('44448888-4444-4444-8444-444444444444',gen_random_uuid(),'超過池',39.7,140.1,ARRAY['44448888-4444-4444-8444-444444444444/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'P0001',NULL,'21st hourly report is rejected');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) SELECT user_id,client_id,name,lat,lng,photo_paths FROM water_reports WHERE user_id='44448888-4444-4444-8444-444444444444' LIMIT 1$$,'23505',NULL,'retry at hourly ceiling still returns UNIQUE rather than rate failure');
RESET ROLE;
ALTER TABLE water_reports DISABLE TRIGGER water_reports_rate_limit;
INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) SELECT '55558888-5555-4555-8555-555555555555',gen_random_uuid(),'総数池',39.7,140.1,ARRAY['55558888-5555-4555-8555-555555555555/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] FROM generate_series(1,1000);
UPDATE water_reports SET created_at=now()-interval '2 days' WHERE user_id='55558888-5555-4555-8555-555555555555';
ALTER TABLE water_reports ENABLE TRIGGER water_reports_rate_limit;
SELECT _water_as('55558888-5555-4555-8555-555555555555'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) VALUES('55558888-5555-4555-8555-555555555555',gen_random_uuid(),'超過池',39.7,140.1,ARRAY['55558888-5555-4555-8555-555555555555/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'P0001',NULL,'1001st owner report is rejected independently of hourly limit');
SELECT _water_as('11118888-1111-4111-8111-111111111111');
SELECT throws_ok($$INSERT INTO water_reports(user_id,client_id,name,lat,lng,photo_paths) VALUES('55558888-5555-4555-8555-555555555555',gen_random_uuid(),'他人の上限を探る',39.7,140.1,ARRAY['55558888-5555-4555-8555-555555555555/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'])$$,'42501',NULL,'rate trigger cannot reveal another owner total-limit state before RLS');
RESET ROLE;
SELECT _water_as('33338888-3333-4333-8333-333333333333',true); SET LOCAL ROLE authenticated;
SELECT ok(review_water_report('aaaabbbb-0000-4000-8000-000000000002','accepted','退会池'),'accept before account cascade');
RESET ROLE;
DELETE FROM auth.users WHERE id='22228888-2222-4222-8222-222222222222';
SELECT is((SELECT count(*)::int FROM community_water_bodies),0,'account cascade also removes public projection');
SELECT finish();
ROLLBACK;
