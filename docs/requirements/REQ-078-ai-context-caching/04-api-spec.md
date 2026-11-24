## API 仕様

### API-078-01: Gemini Context Caching API（外部）
- **Method:** POST
- **Path:** `https://generativelanguage.googleapis.com/v1beta/cachedContents`
- **Request:**
  ```json
  {
    "model": "models/gemini-2.5-flash-lite",
    "contents": [{ "role": "user", "parts": [{ "text": "<固定プロンプト>" }] }],
    "ttl": "3600s"
  }
  ```
- **Response 200:**
  ```json
  {
    "name": "cachedContents/abc123...",
    "model": "models/gemini-2.5-flash-lite",
    "createTime": "2026-04-22T12:00:00Z",
    "expireTime": "2026-04-22T13:00:00Z",
    "usageMetadata": { "totalTokenCount": 1234 }
  }
  ```
- **備考:** 最低トークン数の制約あり（モデル別、要確認）

### API-078-02: 推論時の Cached Content 参照
- **Method:** POST（既存）
- **Path:** `…/models/<model>:generateContent?key=…`
- **追加 Request 項目:**
  ```json
  {
    "cachedContent": "cachedContents/abc123...",
    "contents": [{ "parts": [/* 動的部分のみ */] }]
  }
  ```

---
