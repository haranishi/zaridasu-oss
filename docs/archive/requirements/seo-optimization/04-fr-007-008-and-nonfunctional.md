### FR-007: Google Search Console 連携
- **説明:** Search Console の設定と監視体制を整備する
- **対策項目:**
  - サイト所有権の確認（HTML タグ or DNS）
  - サイトマップの送信
  - インデックス状況の監視
  - 検索パフォーマンスの定期確認
- **環境変数:**
  - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`: 所有権確認用メタタグ

### FR-008: 動的OGP画像生成
- **説明:** 投稿写真がない場合のOGP画像を動的に生成する
- **処理:**
  - Next.js の `ImageResponse` (og) を使用
  - 投稿タイトル、種別アイコン、地域名を含むOGP画像を自動生成
  - `/api/og?title=...&species=...&area=...` エンドポイント
- **出力:** 1200×630px のOGP画像

---

## 非機能要件

### パフォーマンス
- Lighthouse Performance スコア: 90以上（モバイル）
- Core Web Vitals: 全指標「Good」
- サイトマップ生成: 5秒以内
- ページ初回表示: 3秒以内（3G回線）

### セキュリティ
- 構造化データに個人情報を含めない
- OGP画像生成APIにレート制限を設定
- Search Console アクセスは管理者のみ

### 可用性・信頼性
- サイトマップ生成エラー時はキャッシュ済みバージョンを返す
- 構造化データエラーがページ表示に影響しない

### アクセシビリティ
- パンくずナビ: `aria-label="パンくず"`, `aria-current="page"`
- 構造化データと視覚表示の一致

---
