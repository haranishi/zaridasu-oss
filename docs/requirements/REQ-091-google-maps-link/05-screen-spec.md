## 画面仕様

### SC-091-01: SurveyRequestPage の地図エリア
- **対象ファイル:** `src/views/SurveyRequestPage.tsx`
- **変更箇所:** `MiniMap` の直下に小さな帯を追加
- **レイアウト:**
  ```
  +-------------------------------+
  | ← 調査依頼詳細                 |
  +-------------------------------+
  | [MiniMap, h-48 sm:h-56]       |
  +-------------------------------+
  | [📍 Google Maps で経路を表示↗] | ← 新規追加
  +-------------------------------+
  | [ステータス + メタカード]      |
  | [理由カード]                   |
  | [投稿者カード]                 |
  | [協力者セクション]             |
  | [コメントセクション]           |
  | [協力する / クローズボタン]    |
  +-------------------------------+
  ```
- **コンポーネント:** `OpenInGoogleMapsButton lat={request.lat} lng={request.lng}`

### SC-091-02: DetailPage の地図カード内
- **対象ファイル:** `src/views/DetailPage.tsx`
- **変更箇所:** 地図カード（`<div className={card}>` 内）の座標テキスト直後
- **レイアウト:**
  ```
  +-------------------------------+
  | 地図カード                     |
  | +---------------------------+ |
  | | 発見場所                   | |
  | | [DetailMap, h-64]         | |
  | | 35.69174, 139.76901       | |
  | | [📍 Google Maps で開く↗]   | | ← 新規追加
  | +---------------------------+ |
  +-------------------------------+
  ```
- **コンポーネント:** `OpenInGoogleMapsButton lat={post.lat} lng={post.lng} className="mt-3" />`

### SC-091-03: OpenInGoogleMapsButton の見た目
- **デザイン:**
  ```
  +---------------------------------------+
  | 📍 Google Maps で経路を表示  ↗        |
  +---------------------------------------+
  ```
- **スタイル:**
  - 背景: `bg-blue-600 hover:bg-blue-700` (ライト) / `bg-blue-500/20 hover:bg-blue-500/30 text-blue-300` (ダーク)
  - 角丸: `rounded-xl`
  - サイズ: `px-4 py-2 text-sm font-medium`
  - アイコン: lucide-react の `MapPin` (左) + `ExternalLink` (右、サイズ小)
  - フォーカス: `focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none`
- **状態:** 通常 / hover / focus / active のみ。disabled は無し（不正座標時は描画しない）

---
