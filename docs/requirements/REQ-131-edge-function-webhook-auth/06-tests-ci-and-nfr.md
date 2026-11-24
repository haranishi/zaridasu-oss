#### D. テスト / CI

- [ ] **FR-131-09: ユニットテスト（pg-tap または Deno test）**
  - `supabase/functions/notify-post-status/__tests__/auth.test.ts`: secret 無しで POST → 401
  - `supabase/functions/analyze-image/__tests__/auth.test.ts`: secret 無し + reanalysis=false → 401
  - `supabase/functions/notify-survey-request/__tests__/auth.test.ts`: secret 無し → 401
  - secret 正解 + 不正 record.user_id → 「DB に存在しない id」で skip され Resend を叩かないことを mock で検証

- [ ] **FR-131-10: 統合テスト（Playwright or curl smoke）**
  - 本番相当環境で `curl -H 'Authorization: Bearer <ANON>'` のみで叩いて 401 が返ることを CI で確認
  - `.github/workflows/ci.yml` に `edge-function-auth-smoke` ジョブ追加（preview deploy 後に実行）

- [ ] **FR-131-11: secret の往復一致検証**
  - `scripts/check-webhook-secret-sync.ts` を新設し、`supabase secrets list` の `WEBHOOK_SECRET` と Database Webhook 設定（Management API 経由）が一致するかを検証
  - 不一致なら CI fail

### 非機能要件

- [ ] **NFR-131-01: セキュリティ**
  - secret 比較は必ず定数時間比較を使用（タイミング攻撃対策）
  - `WEBHOOK_SECRET` は 32 byte 以上のランダム文字列を要求
  - エラーレスポンスは「Unauthorized」のみ返し、`x-webhook-secret` の有無や長さなどの情報は漏らさない
  - service-role 再 fetch 時に row が無ければ 200 `{ skipped: 'not_found' }` で握り潰す（404 を返すと存在確認攻撃に使われる）

- [ ] **NFR-131-02: 後方互換**
  - 既存の DB Webhook / pg_net トリガーは `x-webhook-secret` 付与後も従来通り動作する
  - 既存の正規呼出し経路に 401 が漏れないこと（migration 適用と Edge Function deploy の順序を runbook で固定）

- [ ] **NFR-131-03: パフォーマンス**
  - 追加の DB 再 fetch は 1 件あたり 1 クエリ増（`posts` の PK 検索なので 1ms 程度）
  - 全体レスポンスタイムへの影響 50ms 未満

- [ ] **NFR-131-04: 可観測性**
  - 401 返却時は `console.warn('[<fn>] webhook secret mismatch', { ip, ua })` を出して攻撃検知に使えるようにする
  - 高頻度の 401 は `admin_alerts` テーブル（既存）に集約
