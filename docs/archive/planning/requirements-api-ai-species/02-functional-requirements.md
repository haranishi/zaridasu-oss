## 機能要件

**F1: 写真アップロード後の自動AI判定**

- 写真を追加したとき（1枚目のみ対象）、自動で Supabase Edge Function `classify-species` を呼び出す
- 判定は非同期・非ブロッキング（判定中も他の項目は操作可能）
- **認証ユーザーのみ**有効（匿名投稿ではスキップ）

**F2: 判定結果UIの表示**

| 状態 | UI |
|-----|----|
| 判定中 | スピナー + 「AI が種類を判定中...」テキスト |
| 信頼度 ≥ 80% | 🟢 緑バナー「AI 判定: アメリカザリガニ（87%）」+ 採用ボタン |
| 信頼度 50〜79% | 🟡 黄バナー「参考: ウシガエルかもしれません（62%）」 |
| 信頼度 < 50% | ⚪ グレーバナー「判定困難（確信度が低いです）」 |
| 判定失敗 | サイレント無視（バナー非表示） |

**F3: 採用・無視ボタン**

- 「採用する」: 種別セレクタを AI 判定結果に変更（ユーザーが後から手動変更可）
- 「無視する」: バナーを閉じ、手動選択のまま

**F4: `classify-species` Edge Function**

- `supabase/functions/classify-species/index.ts` として実装
- `notify-comment/index.ts` の構造を踏襲（Deno, serve, JWT 認証）
- Request: `POST { imageBase64: string, mimeType: string }`
- Response: `{ species: 'american' | 'bullfrog' | 'unknown', confidence: number, reason: string }`
- `ANTHROPIC_API_KEY` は Supabase Edge Function シークレットで管理

```typescript
// Claude へのリクエスト例
{
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 100,
  messages: [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
      { type: 'text', text: '画像の生物を判定してください。{"species":"american"|"bullfrog"|"unknown","confidence":0.0-1.0,"reason":"理由"}のJSONのみ返答。' }
    ]
  }]
}
```

**F5: フォールバックと制限**

- 写真なし投稿: 機能スキップ
- タイムアウト 10 秒・失敗時: サイレント無視
- 1 投稿あたり 1 回のみ呼び出し（写真追加のたびに再判定しない）
- レスポンス JSON バリデーション: `species` が想定外の値の場合は `unknown` にフォールバック

---
