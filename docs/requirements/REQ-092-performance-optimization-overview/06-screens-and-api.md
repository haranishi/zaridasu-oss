## 5. 画面仕様

> 本 REQ は基盤改善であり新規画面は無い。**既存全画面の挙動を変えない**ことを画面要件とする。

### SC-001: ホーム `/`
- **URL**: `/`
- **不変条件**:
  - 地図 / フィルタ / 投稿モーダル / 認証モーダル の挙動が現状と同一。
  - スケルトン → 実描画のちらつき体感が悪化しない。
- **状態管理**:
  - ローディング: スケルトン強化（既存 MapSkeleton 流用）。
  - 空状態: 既存維持。
  - エラー: 既存 `error.tsx` boundary。

### SC-002: 投稿詳細 `/post/[id]`
- **不変条件**: 画像表示が CLS なく出る。next/image 化後のフォールバック挙動を維持。

### SC-003: ダッシュボード `/dashboard`
- **不変条件**: 統計の値が一致。表示順 / バッジ / CSV エクスポートが回帰しない。

### SC-004: トレンド `/trends`
- **不変条件**: チャート初期描画が体感速度として悪化しない。

> 全画面：dynamic 化したコンポーネントの「初回トリガー時のロード遅延」が 200ms 以内に収まるように、`loading` skeleton を必須化。

---

## 6. API仕様

> 本 REQ で新規追加する API はない。既存 API のクエリ最適化のみ。

### API-001: `rpc('get_dashboard_stats')`（REQ-032 で新設）
- **Method**: POST（PostgREST RPC）
- **Path**: `/rest/v1/rpc/get_dashboard_stats`
- **認証**: 必要（RLS 経由）
- **Request body**: `{}` または `{ "user_id": uuid }`
- **Response 200**:
  ```json
  {
    "total_posts": number,
    "this_month": number,
    "last_month": number,
    "by_species": [{ "species": "american", "count": number }, ...],
    "by_info_type": [{ "info_type": "sighting", "count": number }, ...],
    "monthly": [{ "ym": "2026-04", "count": number }, ...],
    "by_municipality": [{ "municipality": "秋田市", "count": number }, ...]
  }
  ```
- **備考**: `SECURITY INVOKER` で実装。詳細は REQ-032。

### API-002: `from('posts').select('id, updated_at')`（sitemap）
- **詳細**: REQ-032 / REQ-043 参照。本 REQ では「`select('*')` の根絶」をタスクとして含める。

---
