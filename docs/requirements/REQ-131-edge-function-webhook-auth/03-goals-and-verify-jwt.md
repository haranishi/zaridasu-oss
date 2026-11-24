## 目的

1. **Edge Function の信頼境界を明示化**し、外部からの直叩きを拒否する
2. **payload を一切信用せず、DB から service-role で再 fetch** する設計へ転換
3. CI / migration で **webhook secret の往復一致**を担保し、ローテーション時の差分を検知

## 要件

### 機能要件

#### A. `supabase/config.toml` で `verify_jwt` を明示

- [ ] **FR-131-01: 全 webhook 関数に `verify_jwt = true` を明示**
  `supabase/config.toml` に以下を追記:
  ```toml
  [functions.notify-post-status]
  verify_jwt = true

  [functions.analyze-image]
  verify_jwt = true

  [functions.analyze-audio]
  verify_jwt = true

  [functions.notify-survey-request]
  verify_jwt = true

  [functions.notify-comment]
  verify_jwt = true

  [functions.notify-gemini-key-failure]
  verify_jwt = true
  ```
  - `health-gemini` は public health endpoint のため `verify_jwt = false` 明示（運用方針による）
  - これにより少なくとも Anon Key 未提示の直叩きは Supabase Gateway 段階でブロック
