### 8. PostCard写真オーバーレイバッジのはみ出し（優先度: 低）

**現状:** 種類名バッジ・情報種別バッジが写真上に配置されるが、長い文字列で枠外にはみ出す可能性
**影響:** 軽微なレイアウト崩れ

**改善:**
- 種類名バッジに `max-w-[60%] truncate` を追加
- 情報種別バッジに `max-w-[35%] truncate` を追加

**対象ファイル:** `src/components/features/posts/PostCard.jsx`

---

### 9. z-index競合：FilterBarドロワーとBottomNav（優先度: 低）

**現状:** FilterBarドロワーが `z-[420]`、BottomNavも `z-[420]`
**影響:** フィルターシートを開いた際にBottomNavが上に表示される場合がある

**改善:**
- FilterBarドロワーを `z-[430]` に変更（モーダル相当）
- または BottomNav を `z-[415]` に下げる

**対象ファイル:** `src/components/features/dashboard/FilterBar.jsx`, `src/components/layout/BottomNav.jsx`

---
