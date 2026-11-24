### スコープ
**含む:**
- `/requests` 一覧ページの新規追加（Phase 1）
- 「調査結果を投稿する」ボタンからの状態引き継ぎと status 自動遷移（Phase 2）
- 応答 / 協力機能（`survey_request_responses` 新設または `response_count` 活用）（Phase 3）
- 近隣ユーザー / 投稿者への通知（Edge Function `notify-survey-request`）（Phase 4）
- コメント直結化（posts 経由の間接接続を解消）（Phase 5）
- 関連 DB マイグレーション、RLS ポリシー、Edge Function、UI コンポーネント

**含まない（対象外）:**
- 調査依頼の **AI 自動分類**（緊急度・種別の自動判定）
- 調査依頼に対する **ご褒美 / バッジ** の追加（既存バッジ機能の改修は別要件）
- **管理者による削除 / モデレーション機能の刷新**（既存 admin 経由で対応可能）
- スマホアプリ向け **push 通知**（メール通知のみ Phase 4 で扱う）

### 前提条件・制約
- **技術スタック**: Next.js 15 App Router + React 19 + Supabase（@supabase/ssr, Edge Functions Deno, Storage, pg_net）
- **既存 DB スキーマ**: `survey_requests` (id, user_id, lat, lng, species, reason, urgency, municipality, status, response_count, created_at, closed_at)
- **status enum**: `'open' | 'responded' | 'closed'`
- **既存 RLS**: SELECT は全員可、INSERT/UPDATE/DELETE は `auth.uid() = user_id` のみ
- **既存レート制限**: `check_survey_request_rate_limit` トリガーで 1 ユーザー 24h あたり 3 件まで（admin は除外）
- **既存リンク**: `posts.survey_request_id UUID REFERENCES survey_requests(id) ON DELETE SET NULL`
- **過去ドキュメント**: `docs/archive/planning/requirements-sos-help-request.md` には SOS 機能として書かれているが、実装は `survey_request` に名称が変更されており乖離あり

### 既知の現状ギャップ
| 項目 | 現状 | あるべき姿 | 担当 Phase |
|---|---|---|---|
| 一覧ページ | 無し | `/requests` でフィルタ・ソート可能 | Phase 1 |
| 結果投稿の引き継ぎ | `router.push('/')` のみ | `survey_request_id` を URL or state で連携 | Phase 2 |
| status 遷移 | open → closed のみ手動 | open → responded（自動）→ closed | Phase 2 |
| `response_count` | 未使用（カラム作成のみ） | 応答数を表示し増減 | Phase 3 |
| 応答者一覧 | 無し | 詳細ページに表示 | Phase 3 |
| 通知 | 無し | 近隣 / 投稿者 / 応答者にメール | Phase 4 |
| コメント | posts 経由の間接 | survey_request に直接スレッド | Phase 5 |

---
