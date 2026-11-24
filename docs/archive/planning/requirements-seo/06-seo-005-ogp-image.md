## SEO-005: OGP 画像の最適化

### 背景

現状の OGP 画像:
- `og-image.png`（34.8KB）
- `og-image.svg`

投稿詳細ページでは `post.photos?.[0]`（ユーザーが投稿した写真）を OGP 画像として使用しているが、写真がない場合はデフォルト画像にフォールバックする。

### ユーザーストーリー

```
As a ユーザー,
I want to 投稿をSNSでシェアしたとき、出没情報の種類がわかる画像が表示されてほしい,
So that クリックしてもらいやすくなる。

受け入れ条件:
- [ ] 投稿詳細に写真がある場合は写真を OGP 画像として使用する（現状維持）
- [ ] 写真がない場合は種類別のデフォルト OGP 画像を使用する（アメリカザリガニ/ウシガエル）
- [ ] デフォルト OGP 画像は 1200×630px の WebP 形式
- [ ] 市区町村・種類・情報種別がテキストとして OGP 画像に含まれる（理想）
```

### 実装設計（段階的）

#### Phase 1（すぐできる）: 種類別デフォルト OGP 画像

```javascript
// PageSEO.jsx または DetailPage.jsx
const OGP_IMAGES = {
  american: 'https://zaridasu.com/og-american.png',
  bullfrog: 'https://zaridasu.com/og-bullfrog.png',
  default:  'https://zaridasu.com/og-image.png',
}

const ogImage = post.photos?.[0]
  ?? OGP_IMAGES[post.species]
  ?? OGP_IMAGES.default
```

#### Phase 2（将来）: 動的 OGP 画像生成

Vercel の `@vercel/og` を使用して、投稿情報を含む画像を動的生成する。

```javascript
// api/og/[id].js
import { ImageResponse } from '@vercel/og'

export default async function handler(req) {
  const { id } = req.query
  const post = await fetchPost(id)

  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', ... }}>
      <span>{post.species === 'american' ? 'アメリカザリガニ' : 'ウシガエル'}</span>
      <span>{post.municipality} で {post.info_type} 情報</span>
    </div>,
    { width: 1200, height: 630 }
  )
}
```

---

