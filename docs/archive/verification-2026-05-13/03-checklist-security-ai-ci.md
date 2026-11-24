### D. セキュリティ (DB 直接確認)
SQL Editor で実行:
```sql
-- REQ-133: 重複 INSERT policy が削除されているか
select count(*) from pg_policies
where schemaname='public' and tablename='reports' and cmd='INSERT';
-- 期待: 1 (validated_insert_reports のみ)

-- REQ-134: drift policy が削除されているか
select count(*) from pg_policies
where schemaname='public' and tablename='audit_logs' and policyname='admin_all_audit_logs';
-- 期待: 0

-- REQ-135: Storage 自分フォルダ限定が効いているか
select with_check from pg_policies
where schemaname='storage' and tablename='objects' and policyname='authenticated_upload';
-- 期待: foldername(name)[1] = auth.uid()::text を含む

-- REQ-136: protect_post_status が 20 列保護版か
select prosrc like '%user_id%' as ok
from pg_proc where proname='protect_post_status';
-- 期待: true

-- REQ-139: cf-connecting-ip 採用
select prosrc like '%cf-connecting-ip%' as ok
from pg_proc where proname='extract_request_ip';
-- 期待: true

-- REQ-143: RPC が動作
select * from get_municipality_post_counts() limit 3;
-- 期待: 市区町村ごとの件数が返る
```

### E. AI 判定の挙動
- [ ] 写真付き投稿 → 数秒で `ai_result.image_analysis` 埋まる
- [ ] 音声付き投稿 → `ai_result.audio_analysis` 埋まる、`gemini-2.5-flash` でも MAX_TOKENS 起きない (REQ-130: thinkingBudget=0)
- [ ] 投稿失敗 → `ai_result.error_kind` 別の文言が出る (詳細不明 になっていない)
- [ ] dedup hit でも audio_analysis が音声無し投稿に混入しない (REQ-129)

### F. CI / GitHub Actions
- [ ] PR 作成 → edge-functions ジョブが pass (deno.lock + cached-only + --no-check)
- [ ] PR 作成 → edge-functions-deploy-lag ジョブが warning/error 出さない (24h 以内に再デプロイ済)
- [ ] PR 作成 → vitest / playwright / build / lint が pass

---
