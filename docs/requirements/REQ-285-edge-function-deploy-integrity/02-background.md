## 1. 背景

### 1.1 何が起きているか（2026-07-29 実測）

| 区分 | 本数 | 関数名 |
|---|---:|---|
| リポジトリに存在（`supabase/functions/*/`、`_shared` 除く） | **14** | — |
| 本番に ACTIVE でデプロイ済み | **7** | `analyze-image`(v26) / `analyze-audio`(v15) / `health-gemini`(v3) / `notify-comment`(v1) / `notify-gemini-key-failure`(v2) / `notify-post-status`(v8) / `notify-survey-request`(v5) |
| **未デプロイ** | **7** | **`enrich-place`** / **`notify-ai-anomaly`** / **`notify-dormant-reengage`** / **`notify-weekly-digest`** / `notify-research-adopted` / `send-push` / `social-announce` |

> 2026-07-28 のクリーニング作業ログでは「15 本中 7 本デプロイ／未デプロイ 8 本」と記録したが、これは `supabase/functions/_shared`（共有モジュール。Edge Function ではない）を 1 本として数えた誤り。**正しくは 14 本中 7 本デプロイ・7 本未デプロイ**である（Management API `GET /v1/projects/{ref}/functions` の実測）。

### 1.2 発覚の経緯

2026-07-28 の本番テストデータ削除作業中、旧 Database Webhook トリガー（`analyze-image-on-insert`）を削除した影響確認のために `net._http_response` を参照したところ、**直近レコードがすべて 404** であることに気づいたのが端緒である。旧トリガーの削除自体は無関係であり、この 404 は以前から継続していた。

---
