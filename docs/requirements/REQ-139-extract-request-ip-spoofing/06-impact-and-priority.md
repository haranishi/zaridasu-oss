## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260512000002_extract_request_ip_hardening.sql` | 新規。`extract_request_ip` / `set_post_reporter_ip` / `check_post_rate_limit` の書き換え + `reporter_ua_hash` 追加 + `system_settings.anonymous_post_enabled` 追加 |
| `supabase/tests/extract_request_ip.test.sql` | 新規。FR-139-06 |
| `supabase/tests/check_post_rate_limit_spoofing.test.sql` | 新規。FR-139-07 |
| `supabase/tests/anonymous_post_switch.test.sql` | 新規。FR-139-08 |
| `src/types/database.ts`（または `supabase/types`） | `posts.reporter_ua_hash` / `system_settings.anonymous_post_enabled` 型追加 |
| `src/views/admin/AdminSettingsPage.tsx`（既存があれば） | 匿名投稿スイッチの toggle UI（任意。FR-139-03 で UI が存在しない場合は本要件範囲外） |
| `docs/requirements/REQ-139-extract-request-ip-spoofing.md` | 本ドキュメント自体 |

### 他機能への影響

- **REQ-034 (posts RLS column protection)**: `posts` への INSERT trigger は変更されるが、RLS ポリシー本体は変更しない。既存テストが通過することを保証。
- **REQ-007 (spam check)**: スパム判定とは独立。むしろ rate limit が機能することでスパム流入量が減る。
- **REQ-020 (audit log integrity)**: `audit_logs.reporter_ip` の値も `extract_request_ip()` 経由で取得されるため、本要件の効果が audit log の精度向上にも波及する。
- **`reporter_ip` 既存データ**: クリーンアップしない。新規 INSERT 以降のみ信頼性が上がる。
- **Cloudflare アーキテクチャ依存**: Supabase が Cloudflare 経由でない環境にデプロイ先を変更した場合、`cf-connecting-ip` が来ないため `x-forwarded-for` の末尾 fallback で動作する。挙動が破綻しないこと。

## 優先度

- **緊急度**: High（攻撃が現状で実行可能。匿名投稿の rate limit を完全バイパスできるため、スパム流入リスクが顕在化中）
- **重要度**: High（匿名投稿の信頼性 / admin の処理コスト / `reporter_ip` を頼った調査の正確性すべてに影響）
- **理由**: 実害が観測されていないとはいえ、攻撃手法が極めて簡単（curl 1 行）であり、攻撃が始まった時の影響は大きい。実装コストは migration 1 本 + テスト 3 本で完結する。Critical ではないのは、(a) RLS が一定の防御線として機能している、(b) admin が status=pending の状態で滞留させられる、ため。ただし放置するほどリスクが拡大するため High。Phase 分け推奨:
  - **Phase 1 (P0)**: FR-139-01（`extract_request_ip` の信頼ヘッダー変更）+ FR-139-06 テスト。最小コストで主要リスクを潰す。
  - **Phase 2 (P1)**: FR-139-02 / 04（UA hash 併用）+ FR-139-07 テスト。
  - **Phase 3 (P2)**: FR-139-03（緊急停止スイッチ）+ FR-139-08 テスト + admin UI。
