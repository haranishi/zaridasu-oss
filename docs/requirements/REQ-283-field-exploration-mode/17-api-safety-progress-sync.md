### API-283-04: 危険・到達不能報告

- **Method:** POST
- **Path:** `/api/field/missions/[id]/safety-reports`
- **認証:** 必要
- **Body:** `reason`, `note?`, `clientLocationAccuracy?`
- **理由:** `private_property`, `dangerous_bank`, `closed`, `flooded`, `other`
- **処理:** 個人位置を保存せず、件数閾値でミッションを自動停止候補にする。

### API-283-05: 地域進捗取得

- **Method:** GET
- **Path:** `/api/field/progress?municipality=秋田市`
- **認証:** 不要
- **出力:** 対象セル数、有効セル数、期限内セル数、再調査セル数、進捗率

### API-283-06: 管理セル／ミッション

- **Method:** POST / PATCH
- **Path:** `/api/admin/field/cells`, `/api/admin/field/missions`
- **認証:** admin
- **処理:** RSC／Route Handlerでadminを再検証し、`audit_logs` にbefore/afterを記録する。

### API-283-07: オフライン投稿同期

#### Prepare

- **Method:** POST
- **Path:** `/api/field/submissions/prepare`
- **認証:** 必要
- **Headers:** `Idempotency-Key: {client_submission_id}`
- **Body:**

```json
{
  "clientSubmissionId": "uuid",
  "clientCreatedAt": "2026-07-25T05:32:00.000Z",
  "fieldSessionId": "uuid",
  "missionVersion": 3,
  "entryMode": "field_mission",
  "media": [
    {
      "role": "whole_body",
      "index": 0,
      "size": 1843200,
      "sha256": "hex"
    }
  ]
}
```

- **処理:** 所有者、ID形式、セッション、ミッション、サイズ上限、既存確定投稿を検証する。
- **Response:** `state=upload_required | already_committed | needs_review`、アップロード先、既存時は同じ `postId`。
- **エラー:** 401、409（同一IDに異なる内容）、410（ミッション失効）、413、422、429。

#### Finalize

- **Method:** POST
- **Path:** `/api/field/submissions/finalize`
- **認証:** 必要
- **Headers:** `Idempotency-Key: {client_submission_id}`
- **Body:** 観察情報、メディアmanifest、位置、精度、観察時刻、公開レベル。
- **処理:** メディア所有権・ハッシュ・必須枠を確認し、投稿作成とfield_session接続をDBトランザクションで確定する。
- **Response:** `postId`, `status=pending`, `serverReceivedAt`, `idempotencyStatus=created | replayed`。
- **再実行:** 同じユーザー・同じID・同じ内容では同じ成功応答を返す。異なる内容は409とする。

#### Status

- **Method:** GET
- **Path:** `/api/field/submissions/[clientSubmissionId]`
- **認証:** 必要
- **出力:** `not_found | upload_required | committed | needs_review`。committed時は `postId` を返す。
- **用途:** finalizeの応答を端末が受け取れなかった場合に、再作成せず受付結果を照合する。

---

