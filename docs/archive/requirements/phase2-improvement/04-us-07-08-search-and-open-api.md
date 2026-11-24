### US-07: フルテキスト検索

```
As a 過去の報告を調べたいユーザー,
I want to キーワードで投稿を全文検索したい,
So that 特定の情報を素早く見つけられる.

受け入れ条件:
- [ ] posts.comment カラムに GIN インデックス付き tsvector カラムを追加する
- [ ] 日本語対応のため pg_bigm または pgroonga 拡張を検討する
- [ ] /search ページにキーワード入力 + フィルタ（種別/地域/期間）UIを実装する
- [ ] 検索結果をハイライト表示する（ts_headline）
- [ ] 検索ワードの入力にデバウンス（300ms）を適用する
- [ ] 検索結果は地図表示とリスト表示の両方で確認できる
```

**DB マイグレーション:**
```sql
-- pg_bigm が利用可能な場合
CREATE EXTENSION IF NOT EXISTS pg_bigm;

ALTER TABLE posts ADD COLUMN search_text TEXT
  GENERATED ALWAYS AS (
    COALESCE(comment, '') || ' ' ||
    COALESCE(municipality, '') || ' ' ||
    COALESCE(species, '')
  ) STORED;

CREATE INDEX idx_posts_search_bigm ON posts
  USING gin (search_text gin_bigm_ops);
```

**優先度: 中** | **影響度: 中** | **実装コスト: 中**

---

### US-08: GeoJSON エクスポート＆公開 API

```
As a 研究者・データ利用者,
I want to 投稿データを GeoJSON 形式でダウンロードし、GIS ソフトで分析したい,
So that 外来生物の分布データを学術研究に活用できる.

受け入れ条件:
- [ ] /api/v1/posts エンドポイントで承認済み投稿の JSON 取得が可能
- [ ] /api/v1/export?format=geojson で GeoJSON 形式のエクスポートが可能
- [ ] API キー認証（任意：レート制限付き公開アクセスも可）
- [ ] フィルタパラメータ: species, municipality, date_from, date_to, info_type
- [ ] レスポンスにページネーション（cursor-based）を実装する
- [ ] API ドキュメントページ（/about/api）を用意する
- [ ] CORS 設定で外部サイトからのアクセスを許可する
- [ ] レート制限: 100 req/min（認証済み）/ 20 req/min（匿名）
```

**GeoJSON レスポンス例:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [140.1, 39.7] },
      "properties": {
        "id": "uuid",
        "species": "american",
        "info_type": "sighting",
        "municipality": "akita",
        "observed_at": "2026-03-28T09:00:00Z",
        "count": 3,
        "weather": "sunny"
      }
    }
  ]
}
```

**優先度: 中** | **影響度: 中** | **実装コスト: 中**

---

