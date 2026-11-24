### 非機能要件

- [ ] **NFR-128-01: セキュリティ**
  - `secret_prefix` の露出は 8 文字までに留め、JWT が admin のみに返す。anon / 一般ユーザーには返さない
  - Management API トークンを CI で扱う場合は repo secret に格納し、 step-level の env で渡す（job-level は避ける）

- [ ] **NFR-128-02: パフォーマンス**
  - `health-gemini` の追加情報取得は同期処理を増やさない（既存の Gemini ping と並行で済む）
  - CI ジョブの追加は 30 秒以内で完了する

- [ ] **NFR-128-03: 後方互換**
  - 既存の `health-gemini` レスポンスフィールド (`ok`, `latency_ms`, `model`, `error_kind`, `message`) は維持。追加フィールドのみ
  - 既存 runbook は section 追加のみで内容は変更しない

### テスト要件

- [ ] **FR-128-11: health-gemini ユニットテスト拡張**
  `supabase/functions/health-gemini/__tests__/handler.test.ts` に追加:
  - レスポンスに `started_at` が ISO8601 で含まれる
  - レスポンスに `secret_prefix` が 8 文字で含まれる（mock の env を `AIzaSyTest123XXXX` にした場合 `AIzaSyTe`）
  - 非 admin JWT では `secret_prefix` が返らない

- [ ] **FR-128-12: secret-function-map のスキーマ検証**
  `scripts/secret-function-map.json` のスキーマを `scripts/__tests__/secret-function-map.test.ts` で検証:
  - 全ての value は `supabase/functions/<name>/` が存在する
  - 全ての key は実際にプロジェクトで使用されている env 名 (`grep "Deno.env.get" -r supabase/functions/` で抽出して比較)

- [ ] **FR-128-13: CI ジョブの動作確認**
  `.github/workflows/ci.yml` の `secret-deploy-sync` を feature ブランチで動かして、意図的に古い deploy を残した状態で warning / error が出るかを確認

