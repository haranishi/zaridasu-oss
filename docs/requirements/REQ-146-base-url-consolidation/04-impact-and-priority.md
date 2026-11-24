## 影響範囲

### 変更対象ファイル
- `src/lib/constants.ts`（BASE_URL の定義整理）
- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/layout.tsx`
- `src/app/area/page.tsx`
- `src/app/area/[municipality]/page.tsx`
- `eslint.config.mjs`（任意：lint ルール追加）
- 新規 / 更新テスト：`src/lib/__tests__/constants.test.ts`
- 関連 docs（あれば）

### 影響しないこと
- 出力される URL の値（純粋リファクタのため挙動変化ゼロ）
- DB / RLS / Edge Functions
- i18n / 認証 / 投稿フロー
- メタデータ / OG / sitemap.xml / robots.txt の中身

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 「機能は壊れていない」が、ドメイン変更・preview 環境追加・staging 切替などの**運用イベントで漏れる典型的なバグの温床**。直す工数は 1〜2 時間と非常に小さく、テスト負荷もごく軽い。低リスク・低工数・効果（運用安心感）が大きい典型的な保守タスクのため、隣接する REQ-144 / REQ-145 と同時にやってしまうのが効率的。任意 ESLint ルールまで含めれば再発防止まで担保できる。
