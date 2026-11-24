## 8. 影響範囲

### 新規

- `supabase/functions/_shared/` — service_role クライアント生成の共有ヘルパー

### 変更

- Edge Function 非テストソース 14 本（キー参照の集約）
- 対応するテスト（最大 10 本）
- `.env.example` — `SUPABASE_SECRET_KEY` の追記
- `docs/runbooks/secret-rotation-and-history-purge.md` — 新方式キー移行手順の追記
- `docs/runbooks/supabase-hardening-checklist.md` — publishable 移行方針・DB 内秘密値の検査手順
- `supabase/migrations/README.md` または `docs/README.md` — ダッシュボード Webhook 禁止ルール

### 本番環境への操作

- Function Secrets への `SUPABASE_SECRET_KEY` 登録
- Vault の値更新
- Edge Function の再デプロイ
- レガシー `service_role` キーの無効化

### 他要件への影響

- **REQ-285**: 再デプロイのタイミングを合わせられる。順序としては REQ-285 FR-285-01（enrich-place デプロイ）を先に済ませ、疎通確認の経路を確保してから本要件に入るのが安全
- **REQ-240 / REQ-270**: `webhook_secret` 未登録の事実（§2-C）は fail-closed 有効化の前提条件である

---
