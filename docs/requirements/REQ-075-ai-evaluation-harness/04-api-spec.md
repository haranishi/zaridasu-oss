## API 仕様

### API-075-01: AI コスト集計（管理画面用）
- **Method:** GET
- **Path:** `/api/admin/ai-cost?period=30d`
- **認証:** 必要（admin only、既存 middleware で保護）
- **Response 200:**
  ```json
  {
    "period_days": 30,
    "total_calls": 1234,
    "total_cost_usd": 0.512,
    "by_function": {
      "analyze-audio": { "calls": 600, "cost_usd": 0.300 },
      "analyze-image": { "calls": 634, "cost_usd": 0.212 }
    },
    "by_model": { "gemini-2.5-flash": { "calls": 600, "cost_usd": 0.300 }, ... },
    "daily": [
      { "date": "2026-04-01", "calls": 42, "cost_usd": 0.018 },
      ...
    ]
  }
  ```
- **エラー:** 401 / 403 / 500
- **備考:** Supabase RPC として実装する案も検討（要確認）

---
