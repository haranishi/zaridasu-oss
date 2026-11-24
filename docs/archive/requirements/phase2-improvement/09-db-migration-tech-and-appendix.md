## 7. DB マイグレーション計画

### Phase 2A で必要なマイグレーション

なし（既存スキーマの変更不要）

### Phase 2B で必要なマイグレーション

```sql
-- 20260401000001_add_notifications.sql
-- notifications テーブル（US-04）

-- 20260401000002_add_fulltext_search.sql
-- search_text カラム + GIN インデックス（US-07）

-- 20260401000003_add_duplicate_check_function.sql
-- check_duplicate_post() 関数（US-11）
```

### Phase 2C で必要なマイグレーション

```sql
-- 20260501000001_add_push_subscriptions.sql
-- push_subscriptions テーブル（US-05）

-- 20260501000002_add_user_alert_settings.sql
-- user_alert_settings テーブル（US-06）

-- 20260501000003_add_user_follows.sql
-- user_follows テーブル（US-13）

-- 20260501000004_add_api_keys.sql
-- api_keys テーブル（US-08）
```

---

## 8. 技術選定

| 機能 | 技術 | 理由 |
|------|------|------|
| エラー監視 | @sentry/nextjs | Next.js 公式統合、ソースマップ対応 |
| E2E テスト | Playwright | Next.js 推奨、クロスブラウザ対応 |
| プッシュ通知 | web-push + VAPID | 標準仕様、サーバー依存なし |
| フルテキスト検索 | pg_bigm (Supabase) | 日本語2-gram対応、PostgreSQL ネイティブ |
| 地理計算 | Haversine (DB関数) | PostGIS 不要で軽量 |
| ウォークスルー | react-joyride | 軽量、カスタマイズ性高い |
| アクセシビリティテスト | axe-core + Playwright | CI 統合可能 |
| ビジュアルリグレッション | Playwright screenshots | 追加ツール不要 |

---

## 付録: コンテンツ優先度

### P1（必須 — ユーザーが最初に目にすべき）
- 地図上の投稿マーカー
- 投稿ボタン（CTA）
- 最新投稿一覧
- 通知バッジ（未読数）

### P2（重要 — 主要アクションを支援）
- フィルタ・検索UI
- 統計サマリー（種別・地域別）
- ウォークスルー（初回のみ）
- オンボーディングバナー

### P3（補助 — あると良い）
- ランキング
- トレンドグラフ
- バッジコレクション
- 月次レポート
