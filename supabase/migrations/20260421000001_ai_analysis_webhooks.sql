-- REQ-072 / REQ-073: AI 判定 Edge Function (analyze-image / analyze-audio) を
-- posts テーブルの変更で自動起動させる DB トリガー。
-- これにより、クライアント側の supabase.functions.invoke に依存せず、
-- ネットワーク断・タブ閉じ等が発生しても AI 判定が確実に実行される。
--
-- 【前提】
-- service_role_key は git にコミットできないため Supabase Vault に保存する。
-- 初回のみ SQL Editor で以下を実行する必要がある:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'edge_function_service_role_key');
-- 既に別名でセット済みの場合は private.call_ai_edge_function の WHERE name を書き換える。

-- pg_net は Supabase Cloud ではデフォルトで net スキーマに導入済み。
-- 未有効の場合のみ有効化する（基本的に no-op）。
create extension if not exists pg_net;

-- Webhook 内部実装を public に露出させないための private スキーマ
create schema if not exists private;
grant usage on schema private to postgres, service_role;

-- =====================================================
-- Helper: Vault から service_role_key を取り出し Edge Function を呼ぶ
-- =====================================================
create or replace function private.call_ai_edge_function(
  p_function_name text,
  p_record jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_key text;
  v_url text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'edge_function_service_role_key'
  limit 1;

  if v_service_key is null then
    raise warning '[ai-webhook] edge_function_service_role_key not set in vault; skipping call to %', p_function_name;
    return;
  end if;

  v_url := 'https://project-not-configured.invalid/functions/v1/' || p_function_name;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('record', p_record),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '[ai-webhook] % failed: %', p_function_name, sqlerrm;
end;
$$;

comment on function private.call_ai_edge_function is
  'AI analysis Edge Function caller. Reads service_role_key from Vault (name=edge_function_service_role_key). Failures are logged as warnings and do not abort the transaction.';

-- =====================================================
-- Trigger: analyze-image on INSERT (photos があれば起動)
-- =====================================================
create or replace function private.trigger_analyze_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photos is not null and array_length(new.photos, 1) > 0 then
    perform private.call_ai_edge_function('analyze-image', to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists analyze_image_on_insert on public.posts;
create trigger analyze_image_on_insert
after insert on public.posts
for each row execute function private.trigger_analyze_image();

-- =====================================================
-- Trigger: analyze-audio on INSERT or UPDATE (audio_url が入った時起動)
-- =====================================================
create or replace function private.trigger_analyze_audio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.audio_url is not null then
    perform private.call_ai_edge_function('analyze-audio', to_jsonb(new));
  elsif tg_op = 'UPDATE'
        and new.audio_url is not null
        and (old.audio_url is distinct from new.audio_url) then
    perform private.call_ai_edge_function('analyze-audio', to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists analyze_audio_on_insert_or_update on public.posts;
create trigger analyze_audio_on_insert_or_update
after insert or update on public.posts
for each row execute function private.trigger_analyze_audio();
