## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260513000008_protect_post_status_full_columns.sql` | 新規。`protect_post_status` 全 20 列保護版 |
| `supabase/schema.sql` | L540-578 を新版に置換。`supabase db reset` 経路でも整合 |
| `supabase/tests/rls_posts.sql` | FR-136-05/06/07 のケース追加（既存 10 plan を +15〜20 plan へ拡張） |
| `docs/architecture/posts-column-policy.md` | 新規 or 追記。owner_update で触れる列・触れない列の表 |

### 他機能への影響

- `src/views/EditPostPage.tsx` / `src/components/forms/PostForm.tsx`: 送信 payload に保護対象列が含まれていてもトリガーで OLD に戻るため動作上は無影響。整理は別 PR で OK
- Edge Function `analyze-image` / `analyze-audio`: `service_role` で動くため保護バイパス、従来通り
- admin 画面（承認/却下/フラグ切り替え/`toggle_official`）: admin role で動くため保護バイパス、従来通り
- REQ-034 / REQ-079: 本 REQ で **包含・再表明**。両 REQ は完了扱いのまま、本 REQ で拡張継続

## 優先度

- **緊急度**: **High**
- **重要度**: **High**
- **理由**:
  - REQ-034 で「is_official 偽装による公式バッジ詐欺」を Critical として封じたのと同様の構造（自分の row に対する追加列改竄）が、REQ-034 以降に増えた 10+ 列で再発しうる
  - 特に `ai_failure_count` リセット → AI 再判定ループでコスト枯渇、`audio_url` 差し替え → 承認後に違法音声混入、`survey_request_id` なりすまし → 他人依頼の成果横取りなど、運用への影響が大きい
  - 本番で REQ-034 の 5 列保護が `20260424000001` migration による `CREATE OR REPLACE FUNCTION` で消えた **疑いがある**ため、本 REQ で改めて統合して保護を「強化＆再表明」する意義がある
  - 修正は migration 1 本 + schema.sql 更新 + pg-tap 拡張で完結、コスト対効果が高い
  - REQ-133 (reports drift) / REQ-134 (audit_logs drift) / REQ-135 (storage drift) と並ぶ、RLS / トリガー drift 統合修正シリーズの 4 本目
