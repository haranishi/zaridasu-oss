## 発見された課題と改善方針

### 1. SignupBanner がボトムタブの裏に隠れる（優先度: 高）

**現状:** `bottom: calc(0px + env(safe-area-inset-bottom))` でBottomNav（h-14 = 56px）を考慮していない
**影響:** バナーが完全にボトムタブの裏に隠れ、未ログインユーザーへの登録促進が機能しない

**改善:**
- モバイル時は `bottom: calc(3.5rem + env(safe-area-inset-bottom))` に変更
- デスクトップでは `bottom: 0` のまま

**対象ファイル:** `src/components/features/auth/SignupBanner.jsx`

---

### 2. PostCard 2カラムが375pxで窮屈（優先度: 高）

**現状:** `grid-cols-2` でカード幅が約181pxになり、テキストが読みにくい
**影響:** 写真・テキスト・バッジが全て小さくなり、操作しづらい

**改善:**
- 375px以下は1カラム、376px以上は2カラムに変更
- Tailwindのカスタムブレークポイント `xs:grid-cols-2` を使用（tailwind.config.jsに `xs: '400px'` を追加）
- デスクトップサイドバーでは1カラム維持

**対象ファイル:** `src/components/features/posts/PostList.jsx`, `tailwind.config.js`

---

### 3. 地図コントロールがボトムタブと重なる（優先度: 高）

**現状:** MapView内のコントロールボタンが `bottom-6`（24px）に配置、BottomNavは56px
**影響:** 地図のレイヤー切替・ヒートマップボタンがボトムタブの裏に隠れる

**改善:**
- モバイル時のコントロールボタンの `bottom` を `bottom-20`（80px）に変更
- Leafletのズームコントロール・ロケーションボタンも同様に調整
- コントロールを縦配置 (`flex-col`) に統一

**対象ファイル:** `src/components/features/map/MapView.jsx`

---
