### F3: 自動承認ロジックの更新

**現在** (`analyze-image/index.ts` L173-180):
```typescript
const shouldAutoApprove =
  !aiResult.error &&
  aiResult.is_appropriate === true &&
  aiResult.species_match === true &&
  typeof aiResult.confidence === 'number' && aiResult.confidence >= 0.75 &&
  aiResult.image_quality !== 'poor'
```

**変更後**: ロジック自体は同じ。統合結果（aggregate）のトップレベル値を使うため、コード変更は不要。ただし、複数枚の総合 confidence が使われることで:
- 1枚がぼやけていても他の写真で補完 → 自動承認率が向上
- 1枚でも不適切画像があれば `is_appropriate: false` → 安全側に倒す

### F4: フロントエンド表示の拡張

**投稿詳細ページ（DetailPage）での表示**:

```
┌──────────────────────────────────────────────┐
│  🤖 AI判定結果                                │
│  総合判定: ✅ アメリカザリガニ  信頼度 91%     │
├──────────────────────────────────────────────┤
│  📷 写真別判定                                │
│  ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │[写真1]│ │[写真2]│ │[写真3]│                  │
│  │ 87%  │ │ 95%  │ │ 82%  │                  │
│  │ 🟢一致│ │ 🟢一致│ │ 🟢一致│                  │
│  └──────┘ └──────┘ └──────┘                  │
└──────────────────────────────────────────────┘
```

**管理者審査画面（AdminPostsPage）での表示**:

カード内の AI 判定セクションに各写真の個別結果を追加表示。写真と判定結果の対応がわかるように並べる。

### F5: 再分析（reanalysis）対応

現在の再分析リクエストも複数枚対応に更新:
- `supabase.functions.invoke('analyze-image', { body: { record: inserted } })` はそのまま
- Edge Function 側で `record.photos` 全件を処理
- 再分析時も並列処理で全写真を再判定

---
