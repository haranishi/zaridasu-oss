## API仕様

新規 API なし。**外部リンクのみ**で、ザリダスのサーバ / Supabase は呼び出さない。

| 外部 URL | 用途 | 備考 |
|---|---|---|
| `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` | ピンを立てて位置を表示 | mode=search 時 |
| `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving` | 現在地から目的地への経路 | mode=directions 時、既定 |

参考: [Google Maps URLs（公開仕様）](https://developers.google.com/maps/documentation/urls/get-started)

---

## データモデル・DB設計

新規テーブル / カラム / インデックス / RLS 変更 **すべて無し**。

- `survey_requests.lat / lng`（既存、double precision）を読み出すだけ
- `posts.lat / lng`（既存、double precision）を読み出すだけ

---

## マイグレーション計画

**該当なし**（DB 変更なし）。

---
