## API仕様

### API-001: 地域別投稿取得
- **Method:** GET
- **Path:** Supabase クライアント直接アクセス（RPC or クエリ）
- **認証:** 不要（公開データ）
- **Query:**
  ```sql
  SELECT * FROM posts
  WHERE municipality = :municipality
    AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 50
  ```
- **Response:** 投稿一覧（位置情報・種別・写真URL含む）
- **キャッシュ:** ISR revalidate: 3600

### API-002: 動的OGP画像生成
- **Method:** GET
- **Path:** `/api/og`
- **認証:** 不要
- **Query Params:**
  - `title` (string, required): ページタイトル
  - `species` (string, optional): 種別コード
  - `area` (string, optional): 地域名
  - `image` (string, optional): 投稿写真URL
- **Response:**
  - 200 OK: `image/png` (1200×630px)
  - 400 Bad Request: パラメータ不正
- **キャッシュ:** `Cache-Control: public, max-age=86400, s-maxage=604800`
- **備考:** Next.js Route Handler + `ImageResponse`

### API-003: Open Search Description
- **Method:** GET
- **Path:** `/opensearch.xml`
- **認証:** 不要
- **Response:**
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
    <ShortName>ザリダス</ShortName>
    <Description>秋田県外来生物情報マップ検索</Description>
    <Url type="text/html" template="https://zaridasu.vercel.app/?q={searchTerms}"/>
    <Image>https://zaridasu.vercel.app/favicon.ico</Image>
  </OpenSearchDescription>
  ```

---
