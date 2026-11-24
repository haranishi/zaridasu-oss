## 影響範囲

### 変更対象ファイル
- `src/components/modals/SurveyRequestForm.tsx`
- `src/components/features/posts/LocationSection.tsx`
- `src/components/features/map/MiniMap.tsx`
- `src/components/features/admin/ReviewCardMiniMap.tsx`（実測次第）
- `src/lib/audio/fixWebmDuration.ts`
- `.size-limit.json`
- 必要なら追加テスト：`src/components/features/posts/__tests__/LocationSection.test.tsx`、`src/lib/audio/__tests__/fixWebmDuration.test.ts`

### 影響しないこと
- DB スキーマ・RLS・Edge Functions
- 投稿 / 調査依頼の送信ロジックそのもの
- Leaflet 表示後の挙動（pan / zoom / cluster）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 機能は壊れていないがバンドル全体の構造に効くベース工事。REQ-124（First Load JS バジェット）との相乗効果が期待でき、後段の地図 UI 機能追加（heat layer 拡張、3D ピン、AR 投稿 等）が走る前にやっておくと chunk 構造が綺麗に保てる。動作リスクは低く、各コンポーネントに loading skeleton を入れる以外の UI 変更は不要。`fix-webm-duration` の dynamic 化は単独で完結する低リスク変更のため先行投入も可。
