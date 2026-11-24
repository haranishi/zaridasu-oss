## 要件

### 機能要件

- [ ] **FR-139-01: `extract_request_ip()` の信頼ヘッダー優先順位変更（短期）**
  関数を以下のロジックに書き換える migration を新設:
  ```sql
  CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    headers JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
    ip_header TEXT;
    parts TEXT[];
    candidate TEXT;
  BEGIN
    -- 1) cf-connecting-ip を最優先。Cloudflare エッジが上書きするためクライアント偽装不可
    candidate := btrim(COALESCE(headers ->> 'cf-connecting-ip', ''));
    IF candidate <> '' THEN RETURN candidate; END IF;

    -- 2) x-forwarded-for は「末尾」を採用。Supabase エッジが追記する値
    ip_header := COALESCE(headers ->> 'x-forwarded-for', '');
    IF btrim(ip_header) <> '' THEN
      parts := string_to_array(ip_header, ',');
      RETURN btrim(parts[array_length(parts, 1)]);
    END IF;

    -- 3) x-real-ip フォールバック（リバースプロキシによってはこれが信頼可能）
    candidate := btrim(COALESCE(headers ->> 'x-real-ip', ''));
    IF candidate <> '' THEN RETURN candidate; END IF;

    RETURN NULL;
  END;
  $$;
  ```
  - 既存の `split_part(ip_header, ',', 1)` を `parts[array_length(parts, 1)]` に変更（末尾採用）
  - `cf-connecting-ip` を最優先に格上げ
  - `x-real-ip` はサードプロキシ環境では信頼可能だが現環境では使われない見込み。フォールバックとして残す

- [ ] **FR-139-02: rate limit 関数の補強（fingerprint 併用）**
  `check_post_rate_limit()` で `reporter_ip` が NULL のとき、現状は「1 分 3 件」に制限している（既存挙動）。これを以下に強化:
  - `request.headers` から `user-agent` を取得し、`user_id IS NULL` のとき `(actor_ip, user_agent_hash)` ペアで rate limit を判定する
  - `user_agent_hash` は `md5(headers ->> 'user-agent')` を使う（PII を直接保存しない）
  - `posts` テーブルに `reporter_ua_hash TEXT` カラムを追加し、INSERT 時にセット
  - `(reporter_ip, reporter_ua_hash)` 複合 index を追加
  - これにより、IP 偽装 + 同一 user-agent の場合も検知可能になる

- [ ] **FR-139-03: 匿名投稿の段階的制限フラグ（中期）**
  `system_settings` テーブル（既存）に `anonymous_post_enabled BOOLEAN NOT NULL DEFAULT TRUE` を追加。admin UI から OFF にできるようにし、攻撃が観測された場合の緊急停止スイッチとして機能させる。`check_post_rate_limit()` の冒頭で `IF NEW.user_id IS NULL AND (SELECT anonymous_post_enabled FROM system_settings LIMIT 1) = FALSE THEN RAISE EXCEPTION '匿名投稿は現在停止中です'; END IF;` を追加。
  ※ 本要件のスコープは「スイッチ追加」のみ。匿名投稿を恒久廃止するかは別 REQ で議論。

- [ ] **FR-139-04: 既存 `reporter_ip` データの取り扱い**
  既存 `posts.reporter_ip` には偽装値が混在している可能性があるため、本 migration 適用後に新規 INSERT のみ新ロジックで保存される旨をコメントで明記する。過去データの一括クリーンアップは行わない（監査ログとの整合性を優先）。`audit_logs.reporter_ip` も同様。

- [ ] **FR-139-05: 認証ユーザー優先導線（UI 側、別 REQ 候補だが本要件で言及）**
  本要件の範囲外だが、`PostForm` 側で「ログインすると投稿上限が緩和されます」のメッセージを表示し、認証ユーザーへの誘導を強化する。実装は別 REQ で扱うため本要件ではメモのみ（`docs/requirements/REQ-139-extract-request-ip-spoofing.md` の本セクションに記載）。
