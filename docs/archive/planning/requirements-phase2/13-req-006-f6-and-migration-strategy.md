#### F6: コンポーネントの段階的 .tsx 変換（Phase 4 - 1ヶ月以内）

**変換優先順位**:

```
高優先（型の恩恵が大きい）:
  src/components/features/posts/PostCard.jsx → .tsx
  src/components/features/posts/PostForm.jsx → .tsx
  src/components/features/map/MapView.jsx   → .tsx

中優先:
  src/components/modals/AuthModal.jsx  → .tsx
  src/pages/HomePage.jsx              → .tsx

低優先（変換コストが高い）:
  src/pages/admin/*.jsx → .tsx（管理画面は複雑）
```

---

### 移行戦略

#### 4フェーズでの段階的移行

```
Phase 1（即時、1-2日）:
  ① npm install -D typescript @types/react @types/react-dom @types/leaflet
  ② tsconfig.json 作成（strict: false, allowJs: true, checkJs: false）
  ③ Supabase 型定義生成（database.types.ts）
  ④ package.json に type-check スクリプト追加
  ⑤ npm run type-check でエラーゼロを確認
  → この段階では既存コードは一切変更しない

Phase 2（1週間、lib/ + utils/）:
  ① src/types/index.ts を作成
  ② supabase.js → supabase.ts（Database 型を付与）
  ③ constants.js → constants.ts
  ④ utils/errorHandler.js → .ts
  ⑤ utils/storage.js → .ts

Phase 3（2週間、hooks/）:
  ① useReverseGeocode.js → .ts
  ② useDeletePost.js → .ts
  ③ usePostForm.js → .ts
  ④ その他 hooks の変換

Phase 4（1ヶ月、components/ + pages/）:
  ① 優先度の高いコンポーネントから順次 .tsx 化
  ② tsconfig の strict: true への移行
  ③ 型エラーの全解消
```
