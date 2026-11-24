## 現状の前提（確認済み）
- AI判定＝**Gemini**（`useGeminiAuthBanner` / `AdminAiCostPage` / migration `20260424000002_ai_cache_registry`）。信頼度は `ai_result.confidence`、UI 表示は `PostCard` / `AIBadge` / `ReviewCardAI` / `MyPostsSection`。
- **ヒートマップは実装済み**（`src/components/features/map/MapView.tsx`、`leaflet.heat`、`MapSettingsContext`）→ 密度化は拡張。
- 逆ジオコーディング＝クライアント Nominatim（`useReverseGeocode`）。閲覧用エリアページ `src/app/area/` あり。**投稿は現状 全国可**。
- お問い合わせは導線/文言のみでフォーム未実装。CSV 書き出し導線あり（`/dataset`、`app/dataset/zaridasu.csv`）。

---
