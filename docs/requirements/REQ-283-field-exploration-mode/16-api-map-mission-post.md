## 7. API仕様

### API-283-01: 公開探索マップ取得

- **Method:** GET
- **Path:** `/api/field/map`
- **認証:** 不要
- **Query:** `bbox`, `zoom`, `species?`, `state?`
- **処理:** 公開可能なセル投影とactiveミッションだけを返す。
- **Response 200:**

```json
{
  "data": {
    "cells": [
      {
        "id": "uuid",
        "cellKey": "akita-...",
        "center": { "lat": 39.71, "lng": 140.10 },
        "state": "revisit_due",
        "lastVerifiedAt": "2026-06-18T00:00:00Z",
        "confidenceBand": "medium",
        "mission": {
          "id": "uuid",
          "estimatedMinutes": 10,
          "distanceMeters": 320,
          "rewardPreviewXp": 80
        }
      }
    ]
  }
}
```

- **備考:** 生の投稿座標、user_id、少数セルから個体地点を逆算できる属性を返さない。

### API-283-02: ミッション開始

- **Method:** POST
- **Path:** `/api/field/sessions`
- **認証:** 必要
- **Body:**

```json
{
  "missionId": "uuid",
  "clientIdempotencyKey": "uuid",
  "location": {
    "lat": 39.71,
    "lng": 140.10,
    "accuracy": 12
  }
}
```

- **処理:** ミッション公開状態、時間帯、同時activeセッション、安全停止、レート制限を検証する。
- **Response:** `sessionId`, `expiresAt`, `arrivalStatus`, `requiredEvidence`
- **エラー:** 401、409（二重開始）、410（終了／停止）、422（位置精度不足）、429

### API-283-03: フィールド投稿作成

- **Method:** POST
- **Path:** 既存投稿作成経路を拡張
- **認証:** 必要
- **追加Body:**

```json
{
  "entryMode": "field_mission",
  "fieldSessionId": "uuid",
  "fieldEvidence": [
    { "photoIndex": 0, "role": "whole_body" },
    { "photoIndex": 1, "role": "diagnostic_detail" },
    { "photoIndex": 2, "role": "habitat_context" }
  ],
  "surveyDurationMinutes": 10
}
```

- **処理:** セッション所有者・ミッション・セル・写真役割・調査時間を検証し、投稿とセッションを同一処理で接続する。
- **出力:** `postId`, `status=pending`, `provisionalResult`

